from fastapi import APIRouter

from app.api.routes.health import router as health_router
from app.api.routes.investigation import router as investigation_router
from app.api.routes.regions import router as regions_router
from app.api.routes.spills import router as spills_router
from app.api.routes.suspects import router as suspects_router
from app.api.routes.vessels import router as vessels_router
from app.api.routes.vessel_tracks import router as vessel_tracks_router

api_router = APIRouter(prefix="/api")
api_router.include_router(health_router)
api_router.include_router(regions_router, prefix="/regions")
api_router.include_router(spills_router, prefix="/spills")
api_router.include_router(vessels_router, prefix="/vessels")
api_router.include_router(vessel_tracks_router)
api_router.include_router(investigation_router)
api_router.include_router(suspects_router)
