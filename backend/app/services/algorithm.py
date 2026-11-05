# backend/app/services/algorithm.py

def calculate_crop_recommendation(avg_temp: float, rainfall_mm: float, soil_type: str):
    """
    Motor de recomendaciones agrícolas.
    Cruza datos climáticos (NASA POWER) con reglas agronómicas.
    """
    recommendations = []

    # 1. Reglas basadas en el clima (Temperatura y Lluvia)
    if avg_temp > 28 and rainfall_mm < 50:
        recommendations.append({
            "cultivo": "Sorgo o Mijo", 
            "razon": "Alta tolerancia a la sequía y calor extremo."
        })
    elif 18 <= avg_temp <= 28 and rainfall_mm >= 60:
        recommendations.append({
            "cultivo": "Maíz", 
            "razon": "Condiciones óptimas de temperatura y humedad detectadas."
        })
    elif avg_temp < 18:
        recommendations.append({
            "cultivo": "Trigo de invierno", 
            "razon": "Requiere y tolera temperaturas más frías para su desarrollo."
        })

    # 2. Reglas basadas en el suelo (Recuperación del campo)
    if soil_type.lower() == "arcilloso":
        recommendations.append({
            "cultivo": "Leguminosas (Garbanzo/Lenteja)", 
            "razon": "El suelo arcilloso retiene agua; las leguminosas ayudarán a fijar nitrógeno."
        })
    
    # Si las condiciones son demasiado extremas y no entra en nada de lo anterior
    if not recommendations:
        recommendations.append({
            "cultivo": "Cobertura vegetal (Alfalfa)", 
            "razon": "Condiciones atípicas. Recomendamos proteger el suelo hasta la próxima temporada."
        })

    return {
        "status": "success",
        "datos_analizados": {
            "temperatura_promedio_c": avg_temp,
            "lluvia_acumulada_mm": rainfall_mm,
            "tipo_suelo": soil_type
        },
        "recomendaciones": recommendations
    }