from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class ChatMessage(BaseModel):
    role: str
    text: str


# --- Medication Schemas ---
class MedicationBase(BaseModel):
    name: str = Field(..., min_length=1)
    dose: Optional[str] = ""
    time: Optional[str] = "08:00"
    frequency: Optional[str] = "Daily"
    durationDays: Optional[int] = Field(default=30, alias="duration_days")
    remainingDoses: Optional[int] = Field(default=30, alias="remaining_doses")
    refillThreshold: Optional[int] = Field(default=5, alias="refill_threshold")
    notes: Optional[str] = ""
    aiInsight: Optional[str] = Field(default="", alias="ai_insight")
    expiryDate: Optional[str] = Field(default="", alias="expiry_date")

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class MedicationCreate(MedicationBase):
    startDate: Optional[str] = Field(default=None, alias="start_date")


class MedicationUpdate(BaseModel):
    name: Optional[str] = None
    dose: Optional[str] = None
    time: Optional[str] = None
    frequency: Optional[str] = None
    durationDays: Optional[int] = Field(default=None, alias="duration_days")
    remainingDoses: Optional[int] = Field(default=None, alias="remaining_doses")
    refillThreshold: Optional[int] = Field(default=None, alias="refill_threshold")
    notes: Optional[str] = None
    aiInsight: Optional[str] = Field(default=None, alias="ai_insight")
    expiryDate: Optional[str] = Field(default=None, alias="expiry_date")

    model_config = ConfigDict(populate_by_name=True)


class MedicationResponse(MedicationBase):
    id: str
    startDate: Optional[str] = Field(default=None, alias="start_date")
    isDeleted: Optional[bool] = Field(default=False, alias="is_deleted")


# --- Dose Log Schemas ---
class DoseLogCreate(BaseModel):
    medicationId: str = Field(..., alias="medication_id")
    status: str = "taken"  # 'taken', 'skipped', 'missed'
    timestamp: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class DoseLogResponse(BaseModel):
    id: str
    medicationId: str = Field(..., alias="medication_id")
    timestamp: str
    status: str

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


# --- Doctor Visit Schemas ---
class DoctorVisitBase(BaseModel):
    doctorName: str = Field(..., alias="doctor_name")
    specialty: Optional[str] = ""
    date: str
    time: Optional[str] = "09:00"
    location: Optional[str] = ""
    notes: Optional[str] = ""
    remindMe: Optional[bool] = Field(default=True, alias="remind_me")

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class DoctorVisitCreate(DoctorVisitBase):
    pass


class DoctorVisitResponse(DoctorVisitBase):
    id: str


# --- Prescription Schemas ---
class PrescriptionCreate(BaseModel):
    title: str = Field(..., min_length=1)
    doctorName: Optional[str] = Field(default="", alias="doctor_name")
    date: Optional[str] = None
    image: str  # Base64 string
    doctorNote: Optional[str] = Field(default="", alias="doctor_note")

    model_config = ConfigDict(populate_by_name=True)


class PrescriptionResponse(BaseModel):
    id: str
    title: str
    doctorName: str = Field(default="", alias="doctor_name")
    date: str
    image: str
    doctorNote: Optional[str] = Field(default="", alias="doctor_note")

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


# --- User Profile Schemas ---
class UserProfile(BaseModel):
    name: Optional[str] = ""
    photo: Optional[str] = ""
    age: Optional[str] = ""
    gender: Optional[str] = ""
    bloodPressure: Optional[str] = Field(default="", alias="blood_pressure")
    sugarLevel: Optional[str] = Field(default="", alias="sugar_level")
    allergies: Optional[str] = ""
    doctorNotes: Optional[str] = Field(default="", alias="doctor_notes")
    additionalNotes: Optional[str] = Field(default="", alias="additional_notes")
    emergencyContacts: Optional[str] = Field(default="", alias="emergency_contacts")

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


# --- Chat & AI Schemas ---
class MedicationItem(BaseModel):
    name: str
    dose: Optional[str] = ""
    frequency: Optional[str] = "Daily"
    expiryDate: Optional[str] = None


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    history: List[ChatMessage] = []
    profile: Optional[UserProfile] = None
    medications: List[MedicationItem] = []


class ChatResponse(BaseModel):
    reply: str
    source: str = "gemini"


class MedicationInsightRequest(BaseModel):
    name: str = Field(..., min_length=1)
    dose: Optional[str] = ""


class PharmacyItem(BaseModel):
    name: str
    uri: Optional[str] = None


class NearbyPharmaciesRequest(BaseModel):
    latitude: float
    longitude: float
