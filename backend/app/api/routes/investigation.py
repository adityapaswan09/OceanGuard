from datetime import datetime, timedelta, timezone

from fastapi import APIRouter

from app.schemas.environment import EnvironmentResponse
from app.schemas.forecast import ForecastResponse
from app.schemas.hindcast import HindcastResponse

router = APIRouter(prefix="/spills/{spill_id}", tags=["investigation"])


from app.services.sakshi_adapter import SakshiAdapter

_adapter = SakshiAdapter()

def _mock_hindcast(spill_id: int) -> HindcastResponse:
    """Proxy to SakshiAdapter for hindcast data."""
    return _adapter.get_hindcast(spill_id)

def _mock_forecast(spill_id: int) -> ForecastResponse:
    """Proxy to SakshiAdapter for forecast data."""
    return _adapter.get_forecast(spill_id)

def _mock_environment(spill_id: int) -> EnvironmentResponse:
    """Proxy to SakshiAdapter for environment data (null wind/current)."""
    return _adapter.get_environment(spill_id)



@router.get("/hindcast", response_model=HindcastResponse)
def get_hindcast(spill_id: int) -> HindcastResponse:
    return _mock_hindcast(spill_id)


@router.get("/forecast", response_model=ForecastResponse)
def get_forecast(spill_id: int) -> ForecastResponse:
    return _mock_forecast(spill_id)


@router.get("/environment", response_model=EnvironmentResponse)
def get_environment(spill_id: int) -> EnvironmentResponse:
    return _mock_environment(spill_id)
