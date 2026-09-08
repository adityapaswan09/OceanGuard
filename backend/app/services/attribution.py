from typing import List

from sqlalchemy.orm import Session

from app.schemas.suspect import SuspectResponse
from app.services.sakshi_adapter import SakshiAdapter


def rank_candidate_vessels(db: Session, spill_id: int) -> List[SuspectResponse]:
    """
    Rank candidate vessels using Sakshi ML pipeline attribution.

    Uses Sakshi's vessel_ranking_top5 which provides:
    - mmsi: Maritime Mobile Service Identity (used as vessel_id)
    - score: Overall attribution score (used as overall_score)
    - is_injected_anomaly: Synthetic validation metadata (not exposed as evidence)

    Note: The Sakshi fixture does not currently provide per-vessel spatial/temporal/
    trajectory/historical-risk breakdowns, so these fields are null.

    Args:
        db: Database session (not used with Sakshi fixture, kept for interface compatibility)
        spill_id: The spill ID to get attribution for

    Returns:
        List of SuspectResponse objects ranked by Sakshi's attribution score

    Raises:
        FileNotFoundError: If the Sakshi fixture file is missing
    """
    adapter = SakshiAdapter()
    vessel_ranking = adapter.get_vessel_ranking(spill_id)

    candidates = []
    for rank, vessel_data in enumerate(vessel_ranking, start=1):
        # Map Sakshi MMSI directly to vessel_id as specified
        vessel_id = vessel_data["mmsi"]
        vessel_name = f"MMSI {vessel_id}"

        candidates.append(
            SuspectResponse(
                rank=rank,
                vessel_id=vessel_id,
                vessel_name=vessel_name,
                overall_score=vessel_data["score"],
                spatial_score=None,
                temporal_score=None,
                trajectory_score=None,
                behaviour_score=None,
                historical_risk_score=None,
                reasons=None,
            )
        )

    return candidates
