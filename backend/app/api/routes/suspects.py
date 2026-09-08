from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.suspect import SuspectResponse
from app.services.attribution import rank_candidate_vessels

router = APIRouter(prefix="/spills/{spill_id}", tags=["suspects"])


@router.get("/suspects", response_model=List[SuspectResponse])
def list_suspects(
    spill_id: int,
    db: Session = Depends(get_db),
) -> List[SuspectResponse]:
    return rank_candidate_vessels(db, spill_id)
