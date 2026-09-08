import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.spill import Spill
from app.schemas.analysis import SpillAnalysisResponse
from app.schemas.spill import SpillListResponse, SpillResponse
from app.services.sakshi_adapter import SakshiAdapter

router = APIRouter(tags=["spills"])


def _spill_query():
    return select(
        Spill,
        func.ST_AsGeoJSON(Spill.polygon).label("polygon_geojson"),
        func.ST_AsGeoJSON(Spill.centroid).label("centroid_geojson"),
    )


def _spill_response(spill: Spill, polygon_geojson: str, centroid_geojson: str) -> SpillResponse:
    return SpillResponse(
        id=spill.id,
        region_id=spill.region_id,
        detection_time=spill.detection_time,
        area_km2=spill.area_km2,
        perimeter_km=spill.perimeter_km,
        confidence=spill.confidence,
        estimated_age_hours=spill.estimated_age_hours,
        polygon=json.loads(polygon_geojson),
        centroid=json.loads(centroid_geojson),
    )


@router.get("/", response_model=SpillListResponse)
def list_spills(db: Session = Depends(get_db)) -> SpillListResponse:
    rows = db.execute(_spill_query()).all()
    items = [
        _spill_response(spill, polygon_geojson, centroid_geojson)
        for spill, polygon_geojson, centroid_geojson in rows
    ]
    return SpillListResponse(items=items, total=len(items))


@router.get("/{spill_id}", response_model=SpillResponse)
def get_spill(spill_id: int, db: Session = Depends(get_db)) -> SpillResponse:
    row = db.execute(_spill_query().where(Spill.id == spill_id)).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Spill not found")

    spill, polygon_geojson, centroid_geojson = row
    return _spill_response(spill, polygon_geojson, centroid_geojson)


@router.get("/{spill_id}/analysis", response_model=SpillAnalysisResponse)
def get_spill_analysis(spill_id: int, db: Session = Depends(get_db)) -> SpillAnalysisResponse:
    """
    Get ML analysis results for a spill detection.

    Currently returns the same fixture output for any spill_id.
    In production, this would query results specific to the spill.

    Returns:
        SpillAnalysisResponse with detection, hindcast, and ranking data.

    Raises:
        HTTPException 404: If spill not found in database.
        HTTPException 503: If ML fixture file is unavailable.
    """
    # Verify the spill exists in the database
    spill = db.execute(select(Spill).where(Spill.id == spill_id)).first()
    if not spill:
        raise HTTPException(status_code=404, detail="Spill not found")

    # Load ML analysis from fixture
    adapter = SakshiAdapter()
    try:
        return adapter.get_analysis(spill_id)
    except FileNotFoundError:
        raise HTTPException(
            status_code=503,
            detail="ML analysis data unavailable. Run the Sakshi pipeline to generate output_for_ui.json.",
        )
