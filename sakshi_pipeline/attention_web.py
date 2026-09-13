"""
attention_web.py -- Causal Attention Web (CAW): a thin attention layer over
candidate causal hypotheses, using torch.nn.MultiheadAttention.

The event embedding (from event_embedding.py) is the query (1 token). Each
candidate hypothesis embedding is a key/value token. A learnable null-key
token is appended so the model can put probability mass on "none of the
candidates explain this event". A physics_bias (log-likelihood terms from
shape/age physics) is added directly to the attention logits before softmax,
so physics evidence can dominate learned similarity when it is strong.

IMPORTANT -- this module's weights (q_proj, kv_proj, null_key, null_bias)
start at a random init and are NOT meaningful until trained. Random-init
forward passes only exist to unit-test the tensor plumbing (see __main__
below and A5's train_attention_web.py). Any real inference/demo use must
load a checkpoint produced by train_attention_web.py (caw_weights.pt) via
`caw.load_state_dict(torch.load("caw_weights.pt"))` -- never ship a raw
`CausalAttentionWeb()` straight off __init__.

Fix vs. the previous (untrained) build: the null-key's additive bias used
to be hardcoded to 0.0, which is a "perfect match" score that structurally
disadvantages every real candidate relative to the null hypothesis, no
matter how strong its physics evidence is. It is now `self.null_bias`, a
learnable nn.Parameter that participates in the same forward pass used for
the cross-entropy loss in A5 -- so its resting value is whatever the
held-out-validated training run actually converges to, not a hand-picked
number.
"""

import torch
import torch.nn as nn


class CausalAttentionWeb(nn.Module):
    def __init__(self, embed_dim=32, n_heads=1, event_dim=None, candidate_dim=None):
        """event_dim/candidate_dim: pass these explicitly (e.g. event_dim=5
        for event_embedding.py's output, candidate_dim=64 for behavioral.py's
        LSTM hidden_size) so the input-projection layers are created NOW,
        in __init__, rather than lazily on first forward(). Lazy creation
        means a freshly-constructed CausalAttentionWeb() has no
        _event_in_proj/_candidate_in_proj submodules yet, so
        load_state_dict() on a checkpoint that DOES have them (because it
        was trained on mismatched-dim inputs) fails with "unexpected
        key(s)". Passing the dims up front avoids that footgun entirely;
        the lazy path below still exists only for callers (e.g. this
        module's own __main__ test) whose embeddings already match
        embed_dim, so no projection is ever needed."""
        super().__init__()
        self.embed_dim = embed_dim
        self.n_heads = n_heads

        # Query projection, Key/Value projection.
        self.q_proj = nn.Linear(embed_dim, embed_dim)
        self.kv_proj = nn.Linear(embed_dim, embed_dim)

        # Learnable null-key vector (its own token, projected like any
        # other candidate).
        self.null_key = nn.Parameter(torch.randn(1, embed_dim))

        # Learnable additive bias for the null-key's attention logit.
        # Starts at 0.0 (== "no prior either way") but is a real nn.Parameter
        # that gradient descent moves during A5 training, exactly like any
        # other weight -- not a hardcoded constant. See module docstring.
        self.null_bias = nn.Parameter(torch.zeros(1))

        self.attn = nn.MultiheadAttention(
            embed_dim=embed_dim, num_heads=n_heads, batch_first=True
        )

        # Eagerly-created if dims given up front (see docstring above);
        # otherwise lazily created on first forward() (only safe for
        # single-process use that never saves/loads a checkpoint).
        self._event_in_proj = nn.Linear(event_dim, embed_dim) if event_dim else None
        self._candidate_in_proj = nn.Linear(candidate_dim, embed_dim) if candidate_dim else None

    def _project_to_embed_dim(self, x, cache_attr):
        """If x's last dim != self.embed_dim, add (and reuse) a Linear
        projection layer to bring it to embed_dim."""
        in_dim = x.shape[-1]
        if in_dim == self.embed_dim:
            return x
        proj = getattr(self, cache_attr)
        if proj is None or proj.in_features != in_dim:
            proj = nn.Linear(in_dim, self.embed_dim)
            setattr(self, cache_attr, proj)
            # register so it shows up in parameters()/state_dict()
            self.add_module(cache_attr, proj)
        return proj(x)

    def forward(self, event_embedding, candidate_embeddings, physics_bias):
        """
        event_embedding: (embed_dim,) -- query, 1 token
        candidate_embeddings: (N, embed_dim) -- keys/values, N hypotheses
        physics_bias: (N,) -- additive term, log(L_shape)+log(L_age) per hypothesis

        Steps:
        1. Null-key ko candidate_embeddings ke saath concat karo (N+1 tokens)
        2. physics_bias ko null-key ke liye self.null_bias (learnable, NOT 0)
           rakho, baaki N ke liye jo diya hai
        3. Attention logits mein physics_bias ko additive term ki tarah daalo
           (before softmax)
        4. Return: alpha, shape (N+1,) -- softmax output, last element =
           null-key ka probability mass
        """
        event_embedding = self._project_to_embed_dim(event_embedding, "_event_in_proj")
        candidate_embeddings = self._project_to_embed_dim(
            candidate_embeddings, "_candidate_in_proj"
        )

        n_candidates = candidate_embeddings.shape[0]

        # 1. Concat null-key onto the candidates -> (N+1, embed_dim)
        keys_values = torch.cat([candidate_embeddings, self.null_key], dim=0)

        # 2. physics_bias for null-key = self.null_bias (learnable), rest = given
        null_bias = self.null_bias.to(dtype=physics_bias.dtype, device=physics_bias.device)
        full_bias = torch.cat([physics_bias, null_bias], dim=0)  # (N+1,)

        # Shapes for nn.MultiheadAttention with batch_first=True:
        # query: (batch=1, tgt_len=1, embed_dim)
        # key/value: (batch=1, src_len=N+1, embed_dim)
        query = event_embedding.unsqueeze(0).unsqueeze(0)
        keys_values = keys_values.unsqueeze(0)

        # 3. Additive attention mask -> added directly to the raw attention
        # logits (Q K^T / sqrt(d)) before softmax, per MultiheadAttention's
        # documented attn_mask semantics.
        attn_mask = full_bias.unsqueeze(0)  # (1, N+1) broadcasts over the single query token

        _, attn_weights = self.attn(
            query, keys_values, keys_values,
            attn_mask=attn_mask,
            need_weights=True,
            average_attn_weights=True,
        )

        # attn_weights: (batch=1, tgt_len=1, src_len=N+1) -> (N+1,)
        alpha = attn_weights.squeeze(0).squeeze(0)
        return alpha


if __name__ == "__main__":
    torch.manual_seed(0)

    embed_dim = 32
    n_candidates = 4

    caw = CausalAttentionWeb(embed_dim=embed_dim, n_heads=1)

    print(f"null_bias at init (untrained): {caw.null_bias.item():.4f}")
    print("(after A5 training this moves away from 0.0 based on what the")
    print(" held-out validation run actually needs -- see train_attention_web.py)\n")

    # --- Test 1: dummy random tensors, confirm alpha sums to 1.0 ---
    event_embedding = torch.randn(embed_dim)
    candidate_embeddings = torch.randn(n_candidates, embed_dim)
    physics_bias = torch.randn(n_candidates)

    alpha = caw(event_embedding, candidate_embeddings, physics_bias)
    print("Test 1 -- random tensors")
    print("  alpha:", alpha.detach().numpy())
    print("  alpha.sum():", alpha.sum().item())
    assert torch.allclose(alpha.sum(), torch.tensor(1.0), atol=1e-5), \
        "alpha does not sum to 1.0"
    print("  PASS: alpha sums to 1.0 (within tolerance)")

    # --- Test 2: one candidate's physics_bias dominates -- its alpha
    # should be the largest ---
    dominant_idx = 2
    physics_bias_dominant = torch.zeros(n_candidates)
    physics_bias_dominant[dominant_idx] = 50.0  # overwhelms attention logits

    alpha_dominant = caw(event_embedding, candidate_embeddings, physics_bias_dominant)
    print("\nTest 2 -- dominant physics_bias sanity check")
    print("  alpha:", alpha_dominant.detach().numpy())
    top_idx = int(torch.argmax(alpha_dominant).item())
    print(f"  argmax index: {top_idx} (expected {dominant_idx})")
    assert top_idx == dominant_idx, "dominant-bias candidate did not get the largest alpha"
    print("  PASS: dominant-bias candidate has the largest alpha")
