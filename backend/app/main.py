from fastapi import FastAPI

app = FastAPI(title="NasaSpaceApp API")

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Backend operativo"}

# backend/app/main.py

from fastapi import FastAPI
# Agrega esta importación en la parte superior:
from app.services.algorithm import calculate_crop_recommendation

app = FastAPI(title="NASA Space Apps - API Agrícola")

# ... (otras rutas que ya existan)

@app.get("/api/v1/recommend")
def get_recommendation(temp: float, rain: float, soil: str = "desconocido"):
    """
    Endpoint para que el Frontend consulte recomendaciones agrícolas.
    """
    resultado = calculate_crop_recommendation(avg_temp=temp, rainfall_mm=rain, soil_type=soil)
    return resultado