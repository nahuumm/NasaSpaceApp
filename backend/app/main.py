from fastapi import FastAPI

app = FastAPI(title="NasaSpaceApp API")

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Backend operativo"}