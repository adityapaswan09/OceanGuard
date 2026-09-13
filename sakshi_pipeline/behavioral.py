"""
behavioral.py -- Behavioral Attention Prior, adapted from the team's
notebook (build_windows / VesselBehaviorEncoder / training loop), unchanged
in structure -- packaged into train_behavioral_prior() so engine.py can call
it once and get back a per-vessel anomaly score dict.

Trained self-supervised on synthetic AIS (no spill labels), same as the
architecture diagram states.
"""

import numpy as np
import torch
import torch.nn as nn


def build_windows(df, seq_len=20):
    windows = []
    mmsi_per_window = []
    start_idx_per_window = []

    for mmsi, g in df.groupby("MMSI"):
        g = g.sort_values("BaseDateTime").reset_index(drop=True)
        if len(g) < seq_len + 1:
            continue

        d_lat = g["LAT"].diff().fillna(0).values
        d_lon = g["LON"].diff().fillna(0).values
        sog = g["SOG"].values
        cog_rad = np.radians(g["COG"].values)
        cog_sin = np.sin(cog_rad)
        cog_cos = np.cos(cog_rad)
        d_t = g["BaseDateTime"].diff().dt.total_seconds().fillna(0).values / 60.0

        feats = np.stack([d_lat, d_lon, sog, cog_sin, cog_cos, d_t], axis=1)

        for start in range(0, len(feats) - seq_len):
            windows.append(feats[start:start + seq_len])
            mmsi_per_window.append(mmsi)
            start_idx_per_window.append(start)

    return (np.asarray(windows, dtype=np.float32), mmsi_per_window, start_idx_per_window)


class VesselBehaviorEncoder(nn.Module):
    def __init__(self, n_features=6, hidden_size=64):
        super().__init__()
        self.lstm = nn.LSTM(input_size=n_features, hidden_size=hidden_size, batch_first=True)
        self.output = nn.Linear(hidden_size, n_features)

    def forward(self, x):
        h, _ = self.lstm(x)
        return self.output(h)


def train_behavioral_prior(ais_df, seq_len=20, n_epochs=60, seed=0, verbose=True):
    """Returns dict: {mmsi: peak_window_error_float}, plus the raw model
    and normalization stats in case engine.py wants to score new windows
    later."""
    torch.manual_seed(seed)

    ais_df = ais_df.copy()
    ais_df["BaseDateTime"] = ais_df["BaseDateTime"] if str(ais_df["BaseDateTime"].dtype) == "datetime64[ns]" \
        else ais_df["BaseDateTime"]

    windows, mmsi_per_window, start_idx_per_window = build_windows(ais_df, seq_len=seq_len)
    if len(windows) == 0:
        raise RuntimeError("No AIS windows built -- check track lengths vs seq_len.")

    X = torch.tensor(windows, dtype=torch.float32)
    X_mean = X.mean(dim=(0, 1), keepdim=True)
    X_std = X.std(dim=(0, 1), keepdim=True) + 1e-6
    X_norm = (X - X_mean) / X_std

    model = VesselBehaviorEncoder(n_features=X.shape[2])
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)

    model.train()
    for epoch in range(n_epochs):
        optimizer.zero_grad()
        pred = model(X_norm)
        loss = torch.mean((pred[:, :-1, :] - X_norm[:, 1:, :]) ** 2)
        loss.backward()
        optimizer.step()
        if verbose and (epoch == 0 or epoch % 15 == 0 or epoch == n_epochs - 1):
            print(f"  [behavioral] epoch {epoch:02d}: loss = {loss.item():.6f}")

    model.eval()
    with torch.no_grad():
        pred = model(X_norm)
        per_window_error = torch.mean((pred[:, :-1, :] - X_norm[:, 1:, :]) ** 2, dim=(1, 2))

    vessel_max = {}
    for mmsi_val in sorted(set(mmsi_per_window)):
        idx = [i for i, m in enumerate(mmsi_per_window) if m == mmsi_val]
        errs = per_window_error[idx]
        local_peak = int(torch.argmax(errs).item())
        vessel_max[mmsi_val] = float(errs[local_peak].item())

    return vessel_max


def get_vessel_embeddings(ais_df, seq_len=20, n_epochs=60, seed=0):
    """
    Same training loop as train_behavioral_prior(), but instead of returning
    a scalar peak-window reconstruction error per vessel, returns the LSTM's
    final hidden state (last timestep of the raw LSTM output, taken before
    VesselBehaviorEncoder.output()) at each vessel's peak-error window, as a
    fixed-length embedding vector.

    Return: dict {mmsi: np.ndarray of shape (hidden_size,)}
    """
    torch.manual_seed(seed)

    ais_df = ais_df.copy()
    ais_df["BaseDateTime"] = ais_df["BaseDateTime"] if str(ais_df["BaseDateTime"].dtype) == "datetime64[ns]" \
        else ais_df["BaseDateTime"]

    windows, mmsi_per_window, start_idx_per_window = build_windows(ais_df, seq_len=seq_len)
    if len(windows) == 0:
        raise RuntimeError("No AIS windows built -- check track lengths vs seq_len.")

    X = torch.tensor(windows, dtype=torch.float32)
    X_mean = X.mean(dim=(0, 1), keepdim=True)
    X_std = X.std(dim=(0, 1), keepdim=True) + 1e-6
    X_norm = (X - X_mean) / X_std

    model = VesselBehaviorEncoder(n_features=X.shape[2])
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)

    model.train()
    for epoch in range(n_epochs):
        optimizer.zero_grad()
        pred = model(X_norm)
        loss = torch.mean((pred[:, :-1, :] - X_norm[:, 1:, :]) ** 2)
        loss.backward()
        optimizer.step()

    model.eval()
    with torch.no_grad():
        pred = model(X_norm)
        per_window_error = torch.mean((pred[:, :-1, :] - X_norm[:, 1:, :]) ** 2, dim=(1, 2))

        # Raw LSTM output (batch, seq_len, hidden_size) -- the hidden state
        # per timestep, before VesselBehaviorEncoder.output() is applied.
        # h[:, -1, :] is the final timestep's hidden state (h_n) per window.
        h, _ = model.lstm(X_norm)
        window_embeddings = h[:, -1, :]  # (n_windows, hidden_size)

    vessel_embeddings = {}
    for mmsi_val in sorted(set(mmsi_per_window)):
        idx = [i for i, m in enumerate(mmsi_per_window) if m == mmsi_val]
        errs = per_window_error[idx]
        local_peak = int(torch.argmax(errs).item())
        peak_global_idx = idx[local_peak]
        vessel_embeddings[mmsi_val] = window_embeddings[peak_global_idx].numpy()

    return vessel_embeddings


if __name__ == "__main__":
    import pandas as pd
    from ais_synthetic import generate_ais, ANOMALOUS_MMSI

    t_obs = pd.Timestamp("2025-05-28 00:00:00")
    ais_df = generate_ais(t_obs)
    vessel_max = train_behavioral_prior(ais_df)

    ranked = sorted(vessel_max.items(), key=lambda kv: -kv[1])
    print("\nVessel ranking by peak behavioral anomaly error:")
    for rank, (mmsi, err) in enumerate(ranked[:5], start=1):
        flag = "  <-- MSC ELSA III (anomalous)" if mmsi == ANOMALOUS_MMSI else ""
        print(f"{rank}. MMSI {mmsi}: {err:.4f}{flag}")
