import os
from contextlib import asynccontextmanager
from typing import List
from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database import engine, Base, get_db
import models
import schemas
from services.gemini_service import (
    analyze_patient_safety,
    get_daily_health_tip,
    get_medication_guidance,
    get_api_key,
)

# Load environment variables
load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Automatically create tables in SQLite on server startup
    Base.metadata.create_all(bind=engine)
    has_key = bool(get_api_key())
    print(f"[MedNotify Server] Database initialized. Gemini API Key configured: {has_key}")
    yield
    print("[MedNotify Server] Shutting down backend.")


app = FastAPI(
    title="MedNotify API",
    version="1.0.0",
    description="Python FastAPI backend powering MedNotify medication management, safety checks, and health tips.",
    lifespan=lifespan,
)

# Enable CORS for frontend development and local testing
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Health & Root ---
@app.get("/")
def root():
    return {
        "name": "MedNotify Backend API",
        "status": "online",
        "docs": "/docs",
        "database": "SQLite (mednotify.db)"
    }


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "database": "connected",
        "gemini_configured": bool(get_api_key()),
    }


# --- Medications CRUD ---
@app.get("/api/medications", response_model=List[schemas.MedicationResponse])
def get_medications(db: Session = Depends(get_db)):
    """Retrieve all active (non-deleted) medications."""
    return db.query(models.MedicationModel).filter(models.MedicationModel.is_deleted == False).all()


@app.get("/api/medications/deleted", response_model=List[schemas.MedicationResponse])
def get_deleted_medications(db: Session = Depends(get_db)):
    """Retrieve recently deleted medications for undo functionality."""
    return db.query(models.MedicationModel).filter(models.MedicationModel.is_deleted == True).order_by(models.MedicationModel.id.desc()).limit(10).all()


@app.post("/api/medications", response_model=schemas.MedicationResponse, status_code=status.HTTP_201_CREATED)
def create_medication(med: schemas.MedicationCreate, db: Session = Depends(get_db)):
    """Create a new medication record."""
    new_med = models.MedicationModel(
        name=med.name,
        dose=med.dose or "",
        time=med.time or "08:00",
        frequency=med.frequency or "Daily",
        duration_days=med.durationDays or 30,
        remaining_doses=med.remainingDoses or 30,
        refill_threshold=med.refillThreshold or 5,
        notes=med.notes or "",
        ai_insight=med.aiInsight or "",
        expiry_date=med.expiryDate or "",
    )
    db.add(new_med)
    db.commit()
    db.refresh(new_med)
    return new_med


@app.put("/api/medications/{med_id}", response_model=schemas.MedicationResponse)
def update_medication(med_id: str, updates: schemas.MedicationUpdate, db: Session = Depends(get_db)):
    """Update an existing medication by ID."""
    med = db.query(models.MedicationModel).filter(models.MedicationModel.id == med_id).first()
    if not med:
        raise HTTPException(status_code=404, detail="Medication not found")

    update_data = updates.model_dump(exclude_unset=True, by_alias=True)
    for field, value in update_data.items():
        setattr(med, field, value)

    db.commit()
    db.refresh(med)
    return med


@app.delete("/api/medications/{med_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_medication(med_id: str, db: Session = Depends(get_db)):
    """Soft-delete a medication so it can be restored via Undo."""
    med = db.query(models.MedicationModel).filter(models.MedicationModel.id == med_id).first()
    if not med:
        raise HTTPException(status_code=404, detail="Medication not found")

    med.is_deleted = True
    db.commit()
    return None


@app.post("/api/medications/{med_id}/restore", response_model=schemas.MedicationResponse)
def restore_medication(med_id: str, db: Session = Depends(get_db)):
    """Restore a previously deleted medication."""
    med = db.query(models.MedicationModel).filter(models.MedicationModel.id == med_id).first()
    if not med:
        raise HTTPException(status_code=404, detail="Medication not found")

    med.is_deleted = False
    db.commit()
    db.refresh(med)
    return med


# --- Dose Logs CRUD ---
@app.get("/api/logs", response_model=List[schemas.DoseLogResponse])
def get_logs(db: Session = Depends(get_db)):
    """Fetch all dose logs sorted with most recent first."""
    return db.query(models.DoseLogModel).order_by(models.DoseLogModel.timestamp.desc()).limit(100).all()


@app.post("/api/logs", response_model=schemas.DoseLogResponse, status_code=status.HTTP_201_CREATED)
def create_dose_log(log_in: schemas.DoseLogCreate, db: Session = Depends(get_db)):
    """Log a dose event and automatically decrement pill inventory if taken."""
    new_log = models.DoseLogModel(
        medication_id=log_in.medicationId,
        status=log_in.status,
    )
    db.add(new_log)

    # Decrement remaining doses on medication if status is 'taken'
    if log_in.status == "taken":
        med = db.query(models.MedicationModel).filter(models.MedicationModel.id == log_in.medicationId).first()
        if med and med.remaining_doses > 0:
            med.remaining_doses -= 1

    db.commit()
    db.refresh(new_log)
    return new_log


# --- Doctor Visits CRUD ---
@app.get("/api/visits", response_model=List[schemas.DoctorVisitResponse])
def get_visits(db: Session = Depends(get_db)):
    """Fetch all scheduled doctor visits."""
    return db.query(models.DoctorVisitModel).order_by(models.DoctorVisitModel.date.asc(), models.DoctorVisitModel.time.asc()).all()


@app.post("/api/visits", response_model=schemas.DoctorVisitResponse, status_code=status.HTTP_201_CREATED)
def create_visit(visit_in: schemas.DoctorVisitCreate, db: Session = Depends(get_db)):
    """Schedule a new doctor visit."""
    new_visit = models.DoctorVisitModel(
        doctor_name=visit_in.doctorName,
        specialty=visit_in.specialty or "",
        date=visit_in.date,
        time=visit_in.time or "09:00",
        location=visit_in.location or "",
        notes=visit_in.notes or "",
        remind_me=visit_in.remindMe,
    )
    db.add(new_visit)
    db.commit()
    db.refresh(new_visit)
    return new_visit


@app.delete("/api/visits/{visit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_visit(visit_id: str, db: Session = Depends(get_db)):
    """Remove a doctor visit."""
    visit = db.query(models.DoctorVisitModel).filter(models.DoctorVisitModel.id == visit_id).first()
    if not visit:
        raise HTTPException(status_code=404, detail="Visit not found")
    db.delete(visit)
    db.commit()
    return None


# --- Prescriptions CRUD ---
@app.get("/api/prescriptions", response_model=List[schemas.PrescriptionResponse])
def get_prescriptions(db: Session = Depends(get_db)):
    """Retrieve all stored prescriptions."""
    return db.query(models.PrescriptionModel).order_by(models.PrescriptionModel.id.desc()).all()


@app.post("/api/prescriptions", response_model=schemas.PrescriptionResponse, status_code=status.HTTP_201_CREATED)
def create_prescription(rx_in: schemas.PrescriptionCreate, db: Session = Depends(get_db)):
    """Save a prescription photo and medical metadata."""
    new_rx = models.PrescriptionModel(
        title=rx_in.title,
        doctor_name=rx_in.doctorName or "",
        date=rx_in.date or "",
        image=rx_in.image,
        doctor_note=rx_in.doctorNote or "",
    )
    db.add(new_rx)
    db.commit()
    db.refresh(new_rx)
    return new_rx


@app.delete("/api/prescriptions/{rx_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_prescription(rx_id: str, db: Session = Depends(get_db)):
    """Delete a prescription by ID."""
    rx = db.query(models.PrescriptionModel).filter(models.PrescriptionModel.id == rx_id).first()
    if not rx:
        raise HTTPException(status_code=404, detail="Prescription not found")
    db.delete(rx)
    db.commit()
    return None


# --- Patient Profile ---
@app.get("/api/profile", response_model=schemas.UserProfile)
def get_profile(db: Session = Depends(get_db)):
    """Get the active user's health profile and vitals."""
    profile = db.query(models.UserProfileModel).filter(models.UserProfileModel.id == 1).first()
    if not profile:
        profile = models.UserProfileModel(id=1)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


@app.put("/api/profile", response_model=schemas.UserProfile)
def update_profile(prof_in: schemas.UserProfile, db: Session = Depends(get_db)):
    """Update patient vitals and health profile."""
    profile = db.query(models.UserProfileModel).filter(models.UserProfileModel.id == 1).first()
    if not profile:
        profile = models.UserProfileModel(id=1)
        db.add(profile)

    profile.name = prof_in.name or ""
    profile.photo = prof_in.photo or ""
    profile.age = prof_in.age or ""
    profile.gender = prof_in.gender or ""
    profile.blood_pressure = prof_in.bloodPressure or ""
    profile.sugar_level = prof_in.sugarLevel or ""
    profile.allergies = prof_in.allergies or ""
    profile.doctor_notes = prof_in.doctorNotes or ""
    profile.additional_notes = prof_in.additionalNotes or ""
    profile.emergency_contacts = prof_in.emergencyContacts or ""

    db.commit()
    db.refresh(profile)
    return profile


# --- AI Intelligence & Safety ---
@app.get("/api/tips/daily")
def daily_tip():
    """Daily health insight for medication adherence."""
    tip = get_daily_health_tip()
    return {"tip": tip}


@app.post("/api/medications/insight")
def medication_insight(req: schemas.MedicationInsightRequest):
    """Specific guidance and consumption tips for a single drug."""
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="Medication name is required.")
    guidance = get_medication_guidance(req.name, req.dose or "")
    return {"insight": guidance}


@app.post("/api/chat", response_model=schemas.ChatResponse)
def safety_chat(req: schemas.ChatRequest):
    """Clinical AI Health Assistant: Cross-references user question against active profile and meds."""
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")
    
    reply = analyze_patient_safety(req)
    return schemas.ChatResponse(reply=reply, source="gemini-backend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
