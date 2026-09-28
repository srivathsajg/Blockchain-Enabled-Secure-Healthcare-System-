"""
app/main.py
FastAPI application entry point for the Diet AI service.
"""
from __future__ import annotations
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.diet import router as diet_router
from app.api.food import router as food_router
from app.api.health import router as health_router
from app.config import FASTAPI_HOST, FASTAPI_PORT, LOG_LEVEL

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)

app = FastAPI(
    title="Medicare Diet AI",
    description=(
        "Personalised nutrition decision-support service. "
        "Uses XGBoost food ranking, PuLP meal optimisation, "
        "and evidence-based medical nutrition rules. "
        "THIS SERVICE IS NOT A CLINICAL TOOL AND DOES NOT DIAGNOSE DISEASES."
    ),
    version="4.0.0",
)

# CORS — allow only the Node.js backend and local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5000", "http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(diet_router)
app.include_router(food_router)
app.include_router(health_router)


@app.on_event("startup")
async def startup():
    """Pre-load the food dataset and ML model into memory at startup."""
    from app.data.loader import load_food_dataframe
    from app.ml.ranker import get_ranker
    from app.utils.logging import get_logger

    log = get_logger("startup")
    log.info("Medicare Diet AI service starting …")
    df = load_food_dataframe()
    log.info(f"Food dataset loaded: {len(df)} recipes")
    ranker = get_ranker()
    log.info(f"Ranker initialised (model_loaded={ranker._model_loaded})")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=FASTAPI_HOST, port=FASTAPI_PORT, reload=False)
