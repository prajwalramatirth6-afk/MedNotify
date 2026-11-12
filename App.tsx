import {
  decodeBase64ToUint8Array,
  decodePcmToAudioBuffer
} from './utils/audioUtils';
import React, { useState, useEffect, useRef } from 'react';
import { Medication, DoseLog, Frequency, Prescription, Pharmacy, UserProfile, DoctorVisit } from './types';
import Navigation from './components/Navigation';
import MedicineModal from './components/MedicineModal';
import SettingsModal, { UserSettings } from './components/SettingsModal';
import ProfileModal from './components/ProfileModal';
import HealthAssistant from './components/HealthAssistant';
import { getDailyHealthTip, findNearbyPharmacies, getGeminiApiKey } from './services/geminiService';
import { GoogleGenAI, Modality } from "@google/genai";

// Audio Decoding Helpers




const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'schedule' | 'pharmacy' | 'history' | 'prescriptions' | 'ai-doctor'>('dashboard');
  const [medications, setMedications] = useState<Medication[]>([]);
  const [deletedMedications, setDeletedMedications] = useState<Medication[]>([]);
  const [logs, setLogs] = useState<DoseLog[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [doctorVisits, setDoctorVisits] = useState<DoctorVisit[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingMed, setEditingMed] = useState<Medication | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [nearbyPharmacies, setNearbyPharmacies] = useState<any[]>([]);
  const [loadingPharmacies, setLoadingPharmacies] = useState(false);
  const [alertMed, setAlertMed] = useState<Medication | null>(null);
  const [alertVisit, setAlertVisit] = useState<DoctorVisit | null>(null);
  const [lastNotified, setLastNotified] = useState<Record<string, string>>({});
  const [dailyTip, setDailyTip] = useState<string>("");
  const [loadingTip, setLoadingTip] = useState(true);
  const [isAudioReady, setIsAudioReady] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [userPhoto, setUserPhoto] = useState<string | null>(null);
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [tempName, setTempName] = useState("");
  const [snoozedMeds, setSnoozedMeds] = useState<Record<string, number>>({});

  const [userProfile, setUserProfile] = useState<UserProfile>({
    age: '',
    gender: '',
    bloodPressure: '',
    sugarLevel: '',
    allergies: '',
    doctorNotes: '',
    additionalNotes: '',
    emergencyContacts: ''
  });

  // Prescription State
  const [isRxFormOpen, setIsRxFormOpen] = useState(false);
  const [rxTitle, setRxTitle] = useState("");
  const [rxDoctor, setRxDoctor] = useState("");
  const [rxDate, setRxDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [rxNote, setRxNote] = useState("");
  const [rxImage, setRxImage] = useState<string | null>(null);
  const [editingRx, setEditingRx] = useState<Prescription | null>(null);
  const rxFileInputRef = useRef<HTMLInputElement>(null);
  const [viewingRx, setViewingRx] = useState<Prescription | null>(null);
  const [rxSearchTerm, setRxSearchTerm] = useState("");

  // Doctor Visit State
  const [isVisitFormOpen, setIsVisitFormOpen] = useState(false);
  const [visitDoctor, setVisitDoctor] = useState("");
  const [visitSpecialty, setVisitSpecialty] = useState("");
  const [visitDate, setVisitDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [visitTime, setVisitTime] = useState("09:00");
  const [visitLocation, setVisitLocation] = useState("");
  const [visitNotes, setVisitNotes] = useState("");
  const [visitRemindMe, setVisitRemindMe] = useState(true);
  const [editingVisit, setEditingVisit] = useState<DoctorVisit | null>(null);

  const [settings, setSettings] = useState<UserSettings>({
    soundEnabled: true,
    notificationsEnabled: true,
    vibrateEnabled: true,
    alarmStyle: 'urgent',
    snoozeDuration: 5,
    missedWindow: 60
  });

  const [deletingMedId, setDeletingMedId] = useState<string | null>(null);

  const audioCtx = useRef<AudioContext | null>(null);
  const alarmInterval = useRef<number | null>(null);
  const currentVoiceSource = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    const savedMeds = localStorage.getItem('mednotify_meds');
    const savedDeletedMeds = localStorage.getItem('mednotify_deleted_meds');
    const savedLogs = localStorage.getItem('mednotify_logs');
    const savedLastNotified = localStorage.getItem('mednotify_last_notified');
    const savedName = localStorage.getItem('mednotify_username');
    const savedPhoto = localStorage.getItem('mednotify_userphoto');
    const savedSettings = localStorage.getItem('mednotify_settings');
    const savedRx = localStorage.getItem('mednotify_prescriptions');
    const savedProfile = localStorage.getItem('mednotify_profile');
    const savedVisits = localStorage.getItem('mednotify_visits');

    if (savedMeds) setMedications(JSON.parse(savedMeds));
    if (savedDeletedMeds) setDeletedMedications(JSON.parse(savedDeletedMeds));
    if (savedLogs) setLogs(JSON.parse(savedLogs));
    if (savedLastNotified) setLastNotified(JSON.parse(savedLastNotified));
    if (savedPhoto) setUserPhoto(savedPhoto);
    if (savedSettings) setSettings(JSON.parse(savedSettings));
    if (savedRx) setPrescriptions(JSON.parse(savedRx));
    if (savedProfile) setUserProfile(JSON.parse(savedProfile));
    if (savedVisits) setDoctorVisits(JSON.parse(savedVisits));

    if (savedName) {
      setUserName(savedName);
    } else {
      setIsNameModalOpen(true);
    }

    if ("Notification" in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const fetchTip = async () => {
      setLoadingTip(true);
      const tip = await getDailyHealthTip();
      setDailyTip(tip);
      setLoadingTip(false);
    };
    fetchTip();

    const unlockAudio = () => {
      initAudio();
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);

    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  useEffect(() => {
    if (userName) {
      localStorage.setItem('mednotify_meds', JSON.stringify(medications));
      localStorage.setItem('mednotify_deleted_meds', JSON.stringify(deletedMedications));
      localStorage.setItem('mednotify_logs', JSON.stringify(logs));
      localStorage.setItem('mednotify_last_notified', JSON.stringify(lastNotified));
      localStorage.setItem('mednotify_settings', JSON.stringify(settings));
      localStorage.setItem('mednotify_profile', JSON.stringify(userProfile));
      localStorage.setItem('mednotify_username', userName);
      localStorage.setItem('mednotify_prescriptions', JSON.stringify(prescriptions));
      localStorage.setItem('mednotify_visits', JSON.stringify(doctorVisits));
      if (userPhoto) localStorage.setItem('mednotify_userphoto', userPhoto);
    }
  }, [medications, deletedMedications, logs, lastNotified, userName, userPhoto, settings, prescriptions, userProfile, doctorVisits]);

  const initAudio = () => {
    if (!audioCtx.current) {
      audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 44100 });
    }
    if (audioCtx.current.state === 'suspended') {
      audioCtx.current.resume().then(() => setIsAudioReady(true));
    } else {
      setIsAudioReady(true);
    }
  };

  const speakReminder = async (med: Medication) => {
    const apiKey = getGeminiApiKey();
    if (!settings.soundEnabled || !apiKey) return;

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `Say in a professional, warm voice: "Hello ${userName || 'there'}, it is time for your ${med.name}. Please take your dose of ${med.dose}. ${med.notes ? 'Additional note: ' + med.notes : ''}"`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Zephyr' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio && audioCtx.current) {
        const audioBuffer = await decodePcmToAudioBuffer(
          decodeBase64ToUint8Array(base64Audio),
          audioCtx.current,
          24000,
          1,
        );

        if (currentVoiceSource.current) {
          currentVoiceSource.current.stop();
        }

        const source = audioCtx.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioCtx.current.destination);
        source.start();
        currentVoiceSource.current = source;
      }
    } catch (error) {
      console.error("TTS Error:", error);
    }
  };

  const startAlarm = () => {
    if (!settings.soundEnabled || !audioCtx.current) return;
    if (audioCtx.current.state === 'suspended') audioCtx.current.resume();

    const playTone = () => {
      if (!audioCtx.current) return;
      const ctx = audioCtx.current;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      if (settings.alarmStyle === 'gentle') {
        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(330, ctx.currentTime);
        osc1.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 1.0);
        osc2.frequency.setValueAtTime(333, ctx.currentTime);
        osc2.frequency.exponentialRampToValueAtTime(443, ctx.currentTime + 1.0);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.2);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.0);
      } else {
        osc1.type = 'sawtooth';
        osc2.type = 'square';
        osc1.frequency.setValueAtTime(440, ctx.currentTime);
        osc1.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.4);
        osc2.frequency.setValueAtTime(445, ctx.currentTime);
        osc2.frequency.exponentialRampToValueAtTime(885, ctx.currentTime + 0.4);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.05);
        gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.35);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
      }

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      const duration = settings.alarmStyle === 'gentle' ? 1.0 : 0.4;
      osc1.stop(ctx.currentTime + duration);
      osc2.stop(ctx.currentTime + duration);
    };

    if (!alarmInterval.current) {
      playTone();
      const interval = settings.alarmStyle === 'gentle' ? 1200 : 450;
      alarmInterval.current = window.setInterval(playTone, interval);
    }
  };

  const stopAlarm = () => {
    if (alarmInterval.current) {
      clearInterval(alarmInterval.current);
      alarmInterval.current = null;
    }
    if (currentVoiceSource.current) {
      currentVoiceSource.current.stop();
      currentVoiceSource.current = null;
    }
  };

  useEffect(() => {
    if (alertMed || alertVisit) {
      startAlarm();
      if (alertMed) speakReminder(alertMed);
    } else {
      stopAlarm();
    }
    return () => stopAlarm();
  }, [alertMed, alertVisit, settings.alarmStyle]);

  const handleLogDose = (medId: string, status: 'taken' | 'skipped' | 'missed') => {
    initAudio();
    const newLog: DoseLog = {
      id: Math.random().toString(36).substr(2, 9),
      medicationId: medId,
      timestamp: new Date().toISOString(),
      status
    };

    setLogs(prev => [newLog, ...prev]);

    if (status === 'taken') {
      setMedications(prev => prev.map(m =>
        m.id === medId ? { ...m, remainingDoses: Math.max(0, m.remainingDoses - 1) } : m
      ));
    }

    if (alertMed?.id === medId) setAlertMed(null);
    setSnoozedMeds(prev => {
      const next = { ...prev };
      delete next[medId];
      return next;
    });
  };

  const handleSnooze = () => {
    if (!alertMed) return;
    initAudio();
    const snoozeTime = Date.now() + (settings.snoozeDuration * 60000);
    setSnoozedMeds(prev => ({ ...prev, [alertMed.id]: snoozeTime }));
    setAlertMed(null);
  };

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const today = now.toLocaleDateString('en-CA');
      const currentTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

      // Med Check
      medications.forEach(med => {
        const notificationKey = `${med.id}-${today}-${currentTimeStr}`;
        const [medHours, medMinutes] = med.time.split(':').map(Number);

        if (med.time === currentTimeStr && !lastNotified[notificationKey]) {
          const alreadyLogged = logs.some(log => log.medicationId === med.id && log.timestamp.startsWith(today));
          if (!alreadyLogged) triggerAlert(med, notificationKey, today);
        }

        const snoozeTarget = snoozedMeds[med.id];
        if (snoozeTarget && Date.now() >= snoozeTarget) {
          triggerAlert(med, `snooze-${med.id}-${Date.now()}`, today);
          setSnoozedMeds(prev => {
            const next = { ...prev };
            delete next[med.id];
            return next;
          });
        }

        const scheduledToday = new Date(now);
        scheduledToday.setHours(medHours, medMinutes, 0, 0);
        const missedThreshold = scheduledToday.getTime() + (settings.missedWindow * 60000);
        if (now.getTime() > missedThreshold) {
          const hasLogToday = logs.some(log => log.medicationId === med.id && log.timestamp.startsWith(today));
          if (!hasLogToday) {
            handleLogDose(med.id, 'missed');
            if (alertMed?.id === med.id) setAlertMed(null);
          }
        }
      });

      // Visit Check
      doctorVisits.forEach(visit => {
        const visitKey = `visit-${visit.id}-${visit.date}-${visit.time}`;
        if (visit.remindMe && visit.date === today && visit.time === currentTimeStr && !lastNotified[visitKey]) {
          setLastNotified(prev => ({ ...prev, [visitKey]: today }));
          setAlertVisit(visit);
          if (settings.notificationsEnabled && "Notification" in window && Notification.permission === "granted") {
            new Notification(`APPOINTMENT: Dr. ${visit.doctorName}`, {
              body: `Time: ${visit.time}. Location: ${visit.location || 'N/A'}`
            });
          }
        }
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [medications, logs, lastNotified, snoozedMeds, settings.missedWindow, alertMed, doctorVisits]);

  const triggerAlert = (med: Medication, key: string, today: string) => {
    setLastNotified(prev => ({ ...prev, [key]: today }));
    setAlertMed(med);
    if (settings.notificationsEnabled && "Notification" in window && Notification.permission === "granted") {
      new Notification(`ALARM: Take ${med.name}`, {
        body: `Dose: ${med.dose}.${med.notes ? `\nNote: ${med.notes}` : ''}`,
        icon: 'https://cdn-icons-png.flaticon.com/512/883/883407.png',
        tag: `med-alarm-${med.id}`,
        requireInteraction: true
      });
    }
  };

  const handleAddMed = (med: Medication) => {
    initAudio();
    setMedications(prev => [...prev, med]);
  };

  const handleUpdateMed = (updatedMed: Medication) => {
    initAudio();
    setMedications(prev => prev.map(m => m.id === updatedMed.id ? updatedMed : m));
    setEditingMed(null);
  };

  const handleDeleteRequest = (e: React.MouseEvent, medId: string) => {
    e.preventDefault();
    e.stopPropagation();
    initAudio();
    setDeletingMedId(medId);
  };

  const confirmDelete = () => {
    if (!deletingMedId) return;
    const medToDelete = medications.find(m => m.id === deletingMedId);
    if (medToDelete) setDeletedMedications(prev => [medToDelete, ...prev].slice(0, 10));
    setMedications(prev => prev.filter(m => m.id !== deletingMedId));
    setDeletingMedId(null);
  };

  const handleRestoreMed = (medId: string) => {
    initAudio();
    const medToRestore = deletedMedications.find(m => m.id === medId);
    if (medToRestore) {
      setMedications(prev => [...prev, medToRestore]);
      setDeletedMedications(prev => prev.filter(m => m.id !== medId));
    }
  };

  const handleRxPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setRxImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSaveRx = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rxImage || !rxTitle) return;

    if (editingRx) {
      const updated = prescriptions.map(p => p.id === editingRx.id ? {
        ...p,
        title: rxTitle,
        doctorName: rxDoctor,
        date: rxDate,
        doctorNote: rxNote,
        image: rxImage
      } : p);
      setPrescriptions(updated);
      setEditingRx(null);
    } else {
      const newRx: Prescription = {
        id: Math.random().toString(36).substr(2, 9),
        title: rxTitle,
        doctorName: rxDoctor,
        date: rxDate,
        image: rxImage,
        doctorNote: rxNote
      };
      setPrescriptions(prev => [newRx, ...prev]);
    }

    setIsRxFormOpen(false);
    resetRxForm();
  };

  const resetRxForm = () => {
    setRxTitle("");
    setRxDoctor("");
    setRxDate(new Date().toLocaleDateString('en-CA'));
    setRxNote("");
    setRxImage(null);
    setEditingRx(null);
  };

  const handleEditRx = (rx: Prescription) => {
    setEditingRx(rx);
    setRxTitle(rx.title);
    setRxDoctor(rx.doctorName);
    setRxDate(rx.date);
    setRxNote(rx.doctorNote || "");
    setRxImage(rx.image);
    setIsRxFormOpen(true);
    setViewingRx(null);
  };

  const handleDeleteRx = (rxId: string) => {
    if (window.confirm("Are you sure you want to delete this prescription?")) {
      setPrescriptions(prev => prev.filter(p => p.id !== rxId));
      setViewingRx(null);
    }
  };

  const handleSaveVisit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!visitDoctor || !visitDate) return;

    if (editingVisit) {
      setDoctorVisits(prev => prev.map(v => v.id === editingVisit.id ? {
        ...v,
        doctorName: visitDoctor,
        specialty: visitSpecialty,
        date: visitDate,
        time: visitTime,
        location: visitLocation,
        notes: visitNotes,
        remindMe: visitRemindMe
      } : v));
      setEditingVisit(null);
    } else {
      const newVisit: DoctorVisit = {
        id: Math.random().toString(36).substr(2, 9),
        doctorName: visitDoctor,
        specialty: visitSpecialty,
        date: visitDate,
        time: visitTime,
        location: visitLocation,
        notes: visitNotes,
        remindMe: visitRemindMe
      };
      setDoctorVisits(prev => [...prev, newVisit]);
    }
    setIsVisitFormOpen(false);
    resetVisitForm();
  };

  const resetVisitForm = () => {
    setVisitDoctor("");
    setVisitSpecialty("");
    setVisitDate(new Date().toLocaleDateString('en-CA'));
    setVisitTime("09:00");
    setVisitLocation("");
    setVisitNotes("");
    setVisitRemindMe(true);
    setEditingVisit(null);
  };

  const handleEditVisit = (v: DoctorVisit) => {
    setEditingVisit(v);
    setVisitDoctor(v.doctorName);
    setVisitSpecialty(v.specialty || "");
    setVisitDate(v.date);
    setVisitTime(v.time);
    setVisitLocation(v.location || "");
    setVisitNotes(v.notes || "");
    setVisitRemindMe(v.remindMe);
    setIsVisitFormOpen(true);
  };

  const handleDeleteVisit = (id: string) => {
    if (window.confirm("Delete this doctor visit?")) {
      setDoctorVisits(prev => prev.filter(v => v.id !== id));
    }
  };

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    if (tempName.trim()) {
      setUserName(tempName.trim());
      setIsNameModalOpen(false);
      initAudio();
    }
  };

  const handleLogout = () => {
    setAlertMed(null);
    setAlertVisit(null);
    stopAlarm();
    setMedications([]);
    setDeletedMedications([]);
    setLogs([]);
    setLastNotified({});
    setUserName(null);
    setUserPhoto(null);
    setPrescriptions([]);
    setDoctorVisits([]);
    setUserProfile({
      age: '',
      gender: '',
      bloodPressure: '',
      sugarLevel: '',
      allergies: '',
      doctorNotes: '',
      additionalNotes: '',
      emergencyContacts: ''
    });
    localStorage.clear();
    setIsSettingsOpen(false);
    setIsNameModalOpen(true);
    setActiveTab('dashboard');
  };

  const openPharmacyInMaps = () => {
    initAudio();
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.open(`https://www.google.com/maps/search/pharmacy/@${pos.coords.latitude},${pos.coords.longitude},15z`, '_blank');
      },
      () => alert("Location access is required."),
      { enableHighAccuracy: true }
    );
  };

  const fetchNearbyPharmacies = () => {
    initAudio();
    setLoadingPharmacies(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const results = await findNearbyPharmacies(pos.coords.latitude, pos.coords.longitude);
        if (results) {
          setNearbyPharmacies(results);
        } else {
          alert("Could not find pharmacies near your current location.");
        }
        setLoadingPharmacies(false);
      },
      () => {
        alert("Location access is required to find pharmacies.");
        setLoadingPharmacies(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const getExpiryState = (dateStr?: string) => {
    if (!dateStr) return 'safe';
    const expiry = new Date(dateStr);
    const now = new Date();
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'expired';
    if (diffDays <= 5) return 'critical';
    if (diffDays <= 30) return 'warning';
    return 'safe';
  };

  const isExpired = (dateStr?: string) => getExpiryState(dateStr) === 'expired';

  const getLogStatusToday = (medId: string) => logs.find(l => l.medicationId === medId && l.timestamp.startsWith(new Date().toISOString().split('T')[0]))?.status;

  const HighlightedNote = ({ note }: { note: string }) => (
    <div className="mt-2.5 p-3 bg-blue-50/50 border-l-4 border-blue-400 rounded-r-2xl animate-in slide-in-from-left-2 duration-300">
      <p className="text-sm font-semibold text-blue-900 leading-snug italic">"{note}"</p>
    </div>
  );

  const RefillBadge = ({ count }: { count: number }) => (
    <div className="mt-2 flex items-center space-x-1.5 px-2 py-1 rounded-lg w-fit bg-amber-500 text-white shadow-sm animate-bounce">
      <span className="text-xs">⚠️</span>
      <span className="text-[9px] font-black tracking-tight uppercase">REFILL: {count} LEFT</span>
    </div>
  );

  const ExpiryBadge = ({ date }: { date: string }) => {
    const state = getExpiryState(date);
    const config: Record<string, { bg: string; text: string; label: string; icon: string; pulse?: boolean }> = {
      expired: { bg: 'bg-red-600', text: 'white', label: 'EXPIRED', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
      critical: { bg: 'bg-amber-100 border-2 border-amber-500', text: 'text-amber-700', label: 'EXPIRING SOON!', pulse: true, icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
      warning: { bg: 'bg-orange-50 border border-orange-200', text: 'text-orange-600', label: 'EXP:', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
      safe: { bg: 'bg-slate-100', text: 'text-slate-500', label: 'EXP:', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' }
    };
    const current = config[state] || config.safe;
    return (
      <div className={`mt-2 flex items-center space-x-1.5 px-2 py-0.5 rounded-lg w-fit ${current.bg} ${current.text} ${current.pulse ? 'animate-pulse scale-105' : ''}`}>
        <span className="text-[8.5px] font-black tracking-tight">{current.label} {new Date(date).toLocaleDateString()}</span>
      </div>
    );
  };

  const filteredPrescriptions = prescriptions.filter(p =>
    p.title.toLowerCase().includes(rxSearchTerm.toLowerCase()) ||
    p.doctorName.toLowerCase().includes(rxSearchTerm.toLowerCase())
  );

  const medicationsNeedingRefill = medications.filter(m => m.remainingDoses <= m.refillThreshold && m.remainingDoses > 0);

  const upcomingVisits = [...doctorVisits]
    .filter(v => {
      const visitTimestamp = new Date(`${v.date}T${v.time}`).getTime();
      return visitTimestamp > Date.now();
    })
    .sort((a, b) => {
      const timestampA = new Date(`${a.date}T${a.time}`).getTime();
      const timestampB = new Date(`${b.date}T${b.time}`).getTime();
      return timestampA - timestampB;
    });

  const nextVisit = upcomingVisits[0];

  return (
    <div className="min-h-screen pb-32 max-w-lg mx-auto bg-[#F8FAFC] shadow-xl relative overflow-x-hidden no-scrollbar">
      {isNameModalOpen && (
        <div className="fixed inset-0 bg-gradient-to-br from-blue-50 via-white to-indigo-50 z-[300] flex flex-col items-center justify-center p-8 animate-in fade-in duration-1000 overflow-hidden">
          {/* Decorative blurred background shapes */}
          <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[40%] bg-blue-400/10 rounded-full blur-[100px] animate-pulse-slow" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[40%] bg-indigo-400/10 rounded-full blur-[100px] animate-pulse-slow" style={{ animationDelay: '1s' }} />

          <div className="max-w-xs w-full text-center space-y-12 relative z-10">
            {/* Logo Section with Float Animation */}
            <div className="flex flex-col items-center space-y-6 animate-in slide-in-from-top-12 duration-1000 ease-out">
              <div className="w-24 h-24 bg-white rounded-[40px] shadow-2xl shadow-blue-200 flex items-center justify-center text-5xl animate-bounce" style={{ animationDuration: '3s' }}>
                💊
              </div>
              <div className="space-y-2">
                <h1 className="text-5xl font-black text-[#1E293B] tracking-tighter">MedNotify</h1>
                <p className="text-[10px] text-blue-500 font-black uppercase tracking-[0.3em] opacity-80">By Hexonova Intelligence</p>
              </div>
            </div>

            {/* Welcome Text Section */}
            <div className="space-y-3 animate-in slide-in-from-bottom-8 fade-in duration-1000 fill-mode-forwards" style={{ animationDelay: '0.4s' }}>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">Your Health, Synced.</h2>
              <p className="text-sm text-slate-500 font-medium leading-relaxed italic">
                A professional companion for your medication routine and wellness journey.
              </p>
            </div>

            {/* Input Form Section */}
            <form onSubmit={handleSaveName} className="space-y-6 animate-in slide-in-from-bottom-12 fade-in duration-1000 fill-mode-forwards" style={{ animationDelay: '0.8s' }}>
              <div className="relative group">
                <div className="absolute inset-0 bg-blue-600/5 rounded-[32px] scale-105 opacity-0 group-focus-within:opacity-100 blur-xl transition-all duration-500" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Enter your name..."
                  className="w-full bg-white border-2 border-slate-100 p-6 rounded-[32px] text-lg font-bold placeholder:text-slate-300 focus:border-blue-500 focus:shadow-2xl focus:shadow-blue-100 outline-none text-center transition-all relative z-10"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className="w-full bg-blue-600 text-white font-black py-6 rounded-[32px] shadow-2xl shadow-blue-200 active:scale-[0.97] transition-all text-lg uppercase tracking-widest hover:bg-blue-700 relative overflow-hidden group"
              >
                <span className="relative z-10">Get Started</span>
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              </button>
            </form>

            <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest animate-pulse" style={{ animationDelay: '1.2s' }}>
              SECURE • PRIVATE • INTELLIGENT
            </p>
          </div>
        </div>
      )}

      <header className="sticky top-0 bg-white/80 backdrop-blur-xl px-6 py-5 z-40 border-b border-slate-100 flex justify-between items-center">
        <div onClick={initAudio} className="cursor-pointer group flex flex-col">
          <h1 className="text-xl font-black text-[#1E293B] tracking-tighter leading-none group-hover:text-blue-600 transition-colors">MedNotify</h1>
          <p className="text-[8px] font-black text-[#1E293B] uppercase tracking-[0.1em] mt-1 opacity-70">By HEXONOVA INTELLIGENCE</p>
        </div>
        <div className="flex items-center space-x-3">
          <button onClick={() => { initAudio(); setIsSettingsOpen(true); }} className="p-2.5 bg-slate-50 border border-slate-100 rounded-2xl text-slate-400 hover:text-blue-600 transition-all active:scale-90"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg></button>
          <div
            onClick={() => { initAudio(); setIsProfileOpen(true); }}
            className="w-11 h-11 rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden cursor-pointer shrink-0 transition-all active:scale-95 hover:border-blue-200"
            title="Health Profile"
          >
            {userPhoto ? <img src={userPhoto} alt="Profile" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-lg bg-slate-50">👤</div>}
          </div>
        </div>
      </header>

      {activeTab === 'dashboard' && (
        <main className="px-6 py-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          {/* Personal Greeting Section */}
          <div className="flex flex-col space-y-1 animate-in slide-in-from-left-4 duration-500 delay-100">
            <h2 className="text-3xl font-black text-[#1E293B] tracking-tight">Hi, {userName || 'User'} <span className="text-blue-600">.</span></h2>
          </div>

          {/* Compact Performance Stats Card */}
          <div className="relative overflow-hidden bg-[#1E293B] rounded-[32px] p-6 text-white shadow-xl shadow-slate-200 animate-in zoom-in-95 duration-700 delay-200">
            <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/10 rounded-full -mr-24 -mt-24 blur-3xl animate-pulse" />

            <div className="relative z-10 flex flex-col space-y-5">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50 mb-0.5">Consistency</h2>
                  <p className="text-lg font-bold tracking-tight">Today's Regimen</p>
                </div>
                <div className="bg-white/10 p-3 rounded-2xl backdrop-blur-md">
                  <span className="text-lg">🔥</span>
                </div>
              </div>

              <div className="flex items-center space-x-6">
                <div className="flex-1">
                  <div className="flex items-baseline space-x-1.5 mb-2">
                    <span className="text-4xl font-black">{logs.filter(l => l.timestamp.startsWith(new Date().toLocaleDateString('en-CA')) && l.status === 'taken').length}</span>
                    <span className="text-slate-400 font-bold uppercase text-[9px] tracking-widest">/ {medications.length} Doses</span>
                  </div>
                  <div className="w-full bg-white/10 h-2.5 rounded-full overflow-hidden p-0.5">
                    <div className="bg-gradient-to-r from-blue-400 to-indigo-400 h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(96,165,250,0.5)]" style={{ width: `${(logs.filter(l => l.timestamp.startsWith(new Date().toLocaleDateString('en-CA')) && l.status === 'taken').length / (medications.length || 1)) * 100}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Refill System Notification */}
          {medicationsNeedingRefill.length > 0 && (
            <div className="bg-white border border-amber-100 rounded-[32px] p-6 shadow-xl shadow-amber-900/5 animate-in slide-in-from-top-2 duration-500 delay-300">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-xl">⚠️</div>
                  <div>
                    <h4 className="text-xs font-black text-[#1E293B] uppercase tracking-widest leading-none">System Alert</h4>
                    <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">Refills Required</p>
                  </div>
                </div>
                <button onClick={() => setActiveTab('pharmacy')} className="text-[9px] font-black text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg uppercase tracking-widest hover:bg-amber-100 transition-colors">Find Local</button>
              </div>
              <div className="space-y-2">
                {medicationsNeedingRefill.map(med => (
                  <div key={med.id} className="flex justify-between items-center bg-slate-50/50 p-4 rounded-2xl border border-slate-100/50">
                    <span className="text-xs font-bold text-slate-700">{med.name}</span>
                    <span className="text-[10px] font-black text-amber-600 uppercase bg-white border border-amber-100 px-2.5 py-1 rounded-lg">{med.remainingDoses} left</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Daily Health Insight Card */}
          <div className="bg-white p-6 rounded-[32px] border border-blue-50 shadow-xl shadow-blue-900/5 flex items-start space-x-5 animate-in fade-in duration-700 delay-400">
            <div className="text-3xl bg-blue-50 w-14 h-14 rounded-[20px] flex items-center justify-center text-blue-600 shrink-0">
              {loadingTip ? <span className="animate-spin text-xl">⌛</span> : "✨"}
            </div>
            <div className="flex-1 space-y-1">
              <h4 className="text-[9px] font-black text-blue-500 uppercase tracking-[0.2em]">DAILY HEALTH INSIGHT</h4>
              <p className="text-sm font-medium text-slate-700 leading-relaxed italic">"{dailyTip}"</p>
            </div>
          </div>

          {/* Medication List Section */}
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-500">
            <div className="flex items-center justify-between mb-6 px-1">
              <h3 className="text-xl font-black text-[#1E293B] tracking-tight">Active Plan</h3>
              <button onClick={() => { initAudio(); setIsFormOpen(true); }} className="text-blue-600 text-[10px] font-black uppercase tracking-widest">+ New Medicine</button>
            </div>

            <div className="space-y-5">
              {medications.length > 0 ? medications.map((med, idx) => {
                const status = getLogStatusToday(med.id);
                const expired = isExpired(med.expiryDate);
                const needsRefill = med.remainingDoses <= med.refillThreshold && med.remainingDoses > 0;

                return (
                  <div
                    key={med.id}
                    onClick={() => { initAudio(); setEditingMed(med); }}
                    className={`group bg-white p-6 rounded-[32px] shadow-sm border transition-all relative cursor-pointer active:scale-[0.98] animate-in slide-in-from-bottom-4 duration-500`}
                    style={{ animationDelay: `${600 + (idx * 100)}ms` }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-4 flex-1">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl transition-all ${status === 'taken' ? 'bg-green-50 text-green-600 shadow-inner' : 'bg-slate-50 text-slate-400'}`}>
                          {status === 'taken' ? '✓' : '💊'}
                        </div>
                        <div className="overflow-hidden flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="text-base font-black text-[#1E293B] truncate leading-none mb-1.5">{med.name}</h4>
                            {/* NEW: Explicit Inline Delete Option */}
                            <button
                              type="button"
                              onClick={(e) => handleDeleteRequest(e, med.id)}
                              className="text-slate-300 hover:text-red-500 p-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity ml-2 shrink-0"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md uppercase tracking-tight">{med.dose}</span>
                            <span className="text-[10px] font-bold text-blue-500 uppercase tracking-tight">{med.time}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1 ml-4">
                        {!status && !expired ? (
                          <div className="flex space-x-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleLogDose(med.id, 'taken'); }}
                              className="w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center hover:bg-green-600 hover:text-white transition-all shadow-sm active:scale-90"
                            ><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg></button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleLogDose(med.id, 'skipped'); }}
                              className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center hover:bg-orange-600 hover:text-white transition-all shadow-sm active:scale-90"
                            ><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg></button>
                          </div>
                        ) : (
                          <div className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${status === 'taken' ? 'bg-green-600 text-white shadow-lg shadow-green-100' : 'bg-slate-100 text-slate-400'}`}>
                            {status || 'Expired'}
                          </div>
                        )}
                      </div>
                    </div>

                    {med.notes && <HighlightedNote note={med.notes} />}

                    <div className="flex flex-wrap gap-2 mt-4">
                      {med.expiryDate && <ExpiryBadge date={med.expiryDate} />}
                      {needsRefill && <RefillBadge count={med.remainingDoses} />}
                    </div>
                  </div>
                );
              }) : (
                <div className="py-24 text-center bg-white rounded-[40px] border-2 border-dashed border-slate-100 shadow-inner">
                  <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-4xl mx-auto mb-6">💊</div>
                  <p className="text-slate-400 font-bold mb-6">Your cabinet is currently empty.</p>
                  <button onClick={() => { initAudio(); setIsFormOpen(true); }} className="bg-blue-600 text-white font-black px-10 py-4 rounded-2xl shadow-xl shadow-blue-100 uppercase tracking-widest text-xs active:scale-95 transition-all">Add First Medicine</button>
                </div>
              )}
            </div>
          </div>
        </main>
      )}

      {activeTab === 'ai-doctor' && (
        <HealthAssistant profile={userProfile} meds={medications} />
      )}

      {activeTab === 'schedule' && (
        <main className="px-6 py-4 space-y-6 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-xl font-bold text-slate-800">🕒 Schedule & Reminders</h2>
            <button onClick={() => { resetVisitForm(); setIsVisitFormOpen(true); }} className="bg-indigo-600 text-white px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-100 active:scale-95 transition-all">
              + Add Visit
            </button>
          </div>

          {nextVisit && (
            <div onClick={() => handleEditVisit(nextVisit)} className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 rounded-[32px] p-6 text-white shadow-2xl shadow-indigo-200 relative overflow-hidden group cursor-pointer active:scale-[0.98] transition-all">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform duration-500" />
              <div className="relative z-10 flex flex-col space-y-4">
                <div className="flex justify-between items-start">
                  <div className="bg-white/20 px-3 py-1 rounded-full backdrop-blur-md">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">Next Appointment</span>
                  </div>
                  {nextVisit.remindMe && <span className="animate-pulse">🔔</span>}
                </div>

                <div className="flex items-center space-x-4">
                  <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center text-3xl">🩺</div>
                  <div className="overflow-hidden">
                    <h3 className="text-2xl font-black leading-none mb-1 truncate">Dr. {nextVisit.doctorName}</h3>
                    <p className="text-sm font-bold text-indigo-100 uppercase tracking-widest">{nextVisit.specialty || 'General Checkup'}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/10">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-white/60 font-black uppercase">When</span>
                    <span className="font-bold">{new Date(nextVisit.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} @ {nextVisit.time}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-white/60 font-black uppercase">Where</span>
                    <p className="font-bold text-xs truncate max-w-[120px]">{nextVisit.location || 'Local Clinic'}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <section className="space-y-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Visit Timeline</h3>
            <div className="flex overflow-x-auto gap-4 no-scrollbar pb-2">
              {upcomingVisits.length > 0 ? upcomingVisits.map((visit, idx) => (
                <div key={visit.id} onClick={() => handleEditVisit(visit)} className={`min-w-[200px] p-4 rounded-3xl shadow-sm flex flex-col relative active:scale-95 transition-all cursor-pointer border ${idx === 0 && activeTab === 'schedule' ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-100'}`}>
                  <div className="flex items-center space-x-2 mb-3">
                    <div className={`p-2 rounded-xl ${idx === 0 ? 'bg-indigo-200 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-[9px] font-black text-slate-400 uppercase">{visit.specialty || 'Checkup'}</p>
                      <h4 className="font-bold text-xs truncate text-slate-800">Dr. {visit.doctorName}</h4>
                    </div>
                  </div>
                  <div className="mt-auto flex justify-between items-center">
                    <p className="text-[10px] font-black text-slate-500">{new Date(visit.date).toLocaleDateString([], { month: 'short', day: 'numeric' })} • {visit.time}</p>
                    {visit.remindMe && <span className="text-[10px]">🔔</span>}
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteVisit(visit.id); }} className="absolute top-2 right-2 text-slate-300 hover:text-red-600 p-1">✕</button>
                </div>
              )) : (
                <div className="w-full py-10 bg-white border-2 border-dashed border-slate-100 rounded-[32px] flex flex-col items-center justify-center text-center">
                  <span className="text-3xl mb-2">🩺</span>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No visit reminders</p>
                </div>
              )}
            </div>
          </section>

          <section className="space-y-4 pt-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Medication Routine</h3>
            {medications.length > 0 ? medications.sort((a, b) => a.time.localeCompare(b.time)).map(med => (
              <div key={med.id} className="flex flex-col p-5 rounded-3xl border bg-white shadow-md border-blue-100 group hover:border-blue-400 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <span className="text-sm font-bold text-blue-600">{med.time}</span>
                    <h4 className="font-bold text-slate-800">{med.name}</h4>
                  </div>
                  <div className="flex space-x-2">
                    {getLogStatusToday(med.id) ? (
                      <span className="text-[10px] font-black uppercase px-2 py-1 bg-slate-100 text-slate-400 rounded-lg">{getLogStatusToday(med.id)}</span>
                    ) : (
                      <button onClick={() => handleLogDose(med.id, 'taken')} className="text-[10px] font-black uppercase text-green-600 px-3 py-1.5 bg-green-50 rounded-lg active:scale-95 transition-all">Take</button>
                    )}
                    <button onClick={() => { initAudio(); setEditingMed(med); }} className="text-[10px] font-black uppercase text-blue-500 px-3 py-1.5 bg-blue-50 rounded-lg active:scale-95 transition-all">Edit</button>
                  </div>
                </div>
              </div>
            )) : (
              <p className="text-xs text-slate-400 italic text-center py-4">Add medications to see your routine.</p>
            )}
          </section>
        </main>
      )}

      {activeTab === 'prescriptions' && (
        <main className="px-6 py-4 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-black text-slate-800">Rx Vault</h2>
            <button onClick={() => { resetRxForm(); setIsRxFormOpen(true); }} className="bg-blue-600 text-white p-3 rounded-2xl shadow-lg active:scale-95 transition-all text-sm font-bold flex items-center space-x-2">
              <span>+ Upload Rx</span>
            </button>
          </div>

          <div className="relative mb-6">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg">🔍</span>
            <input
              type="text"
              placeholder="Search prescriptions or doctors..."
              className="w-full pl-12 pr-4 py-4 bg-white border border-slate-100 rounded-2xl shadow-sm focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              value={rxSearchTerm}
              onChange={(e) => setRxSearchTerm(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {filteredPrescriptions.map(rx => (
              <div key={rx.id} onClick={() => setViewingRx(rx)} className="bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-100 active:scale-95 transition-all cursor-pointer group hover:border-blue-200">
                <div className="h-40 relative overflow-hidden bg-slate-100">
                  <img src={rx.image} alt={rx.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute top-2 right-2 bg-black/40 backdrop-blur-md text-white text-[10px] px-2 py-1 rounded-lg font-bold">
                    {new Date(rx.date).toLocaleDateString()}
                  </div>
                </div>
                <div className="p-4">
                  <h5 className="font-bold text-slate-800 text-sm truncate">{rx.title}</h5>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider truncate mt-1">Dr. {rx.doctorName}</p>
                </div>
              </div>
            ))}
            {filteredPrescriptions.length === 0 && (
              <div className="col-span-2 py-20 text-center">
                <span className="text-4xl block mb-4">📂</span>
                <p className="text-slate-400 font-bold">No prescriptions found</p>
              </div>
            )}
          </div>
        </main>
      )}

      {activeTab === 'pharmacy' && (
        <main className="px-6 py-4 space-y-6 animate-in fade-in slide-in-from-bottom-4">
          <div className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100 text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4">📍</div>
            <h2 className="text-xl font-black text-slate-800 mb-1">Nearby Pharmacies</h2>
            <p className="text-xs text-slate-400 mb-6">Discovery powered by Google Maps</p>

            {loadingPharmacies ? (
              <div className="py-12 space-y-4">
                <div className="animate-spin text-4xl mx-auto">⏳</div>
                <p className="text-sm font-bold text-blue-600 animate-pulse">Scanning local area...</p>
              </div>
            ) : nearbyPharmacies.length > 0 ? (
              <div className="space-y-3 mb-6 text-left">
                {nearbyPharmacies.map((pharm, idx) => (
                  <div key={idx} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex justify-between items-center group active:scale-95 transition-all">
                    <div className="overflow-hidden">
                      <h4 className="font-bold text-slate-800 text-sm truncate max-w-[180px]">{pharm.name}</h4>
                      <p className="text-[10px] text-blue-500 font-bold uppercase tracking-wider">Verified Pharmacy</p>
                    </div>
                    <button onClick={() => window.open(pharm.uri, '_blank')} className="bg-white p-2 rounded-xl shadow-sm border border-slate-200 text-blue-600 transition-transform active:scale-90 shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </button>
                  </div>
                ))}
                <button onClick={fetchNearbyPharmacies} className="w-full text-[10px] font-black text-blue-600 uppercase tracking-widest py-3 transition-colors hover:text-blue-800">Refresh List</button>
              </div>
            ) : (
              <div className="space-y-4 mb-6">
                <button onClick={fetchNearbyPharmacies} className="w-full bg-blue-50 text-blue-600 font-black py-4 rounded-2xl border-2 border-dashed border-blue-200 active:scale-95 transition-all uppercase tracking-widest text-[10px]">
                  Scan My Current Location
                </button>
              </div>
            )}

            <button onClick={openPharmacyInMaps} className="w-full bg-blue-600 text-white font-black py-5 rounded-2xl active:scale-95 transition-all shadow-xl text-lg flex items-center justify-center space-x-3">
              <span>🚀 Open Google Maps</span>
            </button>
          </div>
        </main>
      )}

      {activeTab === 'history' && (
        <main className="px-6 py-4 space-y-12 animate-in fade-in slide-in-from-bottom-4">
          <section>
            <h2 className="text-xl font-bold text-slate-800 mb-4">📝 Medication Logs</h2>
            <div className="space-y-3">
              {logs.length > 0 ? logs.slice(0, 50).map(log => (
                <div key={log.id} className="bg-white p-4 rounded-2xl flex items-center justify-between border border-slate-100 transition-colors hover:bg-slate-50">
                  <h5 className="font-bold text-slate-800 text-sm">{(medications.find(m => m.id === log.medicationId) || deletedMedications.find(m => m.id === log.medicationId))?.name || 'Unknown Medicine'}</h5>
                  <div className="flex items-center space-x-2">
                    <span className="text-[8px] text-slate-400">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className={`text-[10px] font-black px-2 py-1 rounded-lg uppercase ${log.status === 'taken' ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'}`}>{log.status}</span>
                  </div>
                </div>
              )) : (
                <div className="text-center py-10">
                  <p className="text-slate-400 text-sm italic">No logs found yet.</p>
                </div>
              )}
            </div>
          </section>

          {deletedMedications.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4">🗑️ Recently Deleted (Undo)</h2>
              <div className="space-y-3">
                {deletedMedications.map(med => (
                  <div key={med.id} className="bg-white p-4 rounded-2xl flex items-center justify-between border border-slate-100 opacity-80">
                    <div>
                      <h5 className="font-bold text-slate-700 text-sm">{med.name}</h5>
                      <p className="text-[10px] text-slate-400">{med.dose}</p>
                    </div>
                    <button
                      onClick={() => handleRestoreMed(med.id)}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black px-4 py-2 rounded-xl uppercase tracking-widest shadow-md shadow-blue-100 active:scale-95 transition-all"
                    >
                      Undo
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      )}

      {/* Viewing Rx Modal */}
      {viewingRx && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[250] flex flex-col items-center p-6 overflow-y-auto no-scrollbar animate-in zoom-in-95 duration-200">
          <div className="w-full max-w-sm flex flex-col min-h-full">
            <div className="flex justify-between items-center mb-6 text-white shrink-0">
              <h3 className="text-2xl font-black truncate max-w-[240px]">{viewingRx.title}</h3>
              <button onClick={() => setViewingRx(null)} className="p-3 bg-white/10 rounded-full hover:bg-white/20 transition-colors">✕</button>
            </div>

            <div className="w-full aspect-square md:aspect-[4/5] bg-white/5 rounded-[40px] overflow-hidden shadow-2xl relative mb-8 group shrink-0">
              <img src={viewingRx.image} alt={viewingRx.title} className="w-full h-full object-contain" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-6">
                <span className="text-white/60 text-[10px] font-bold uppercase tracking-widest">Pinch to zoom (native)</span>
              </div>
            </div>

            <div className="space-y-6 flex-1 text-white">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white/5 rounded-3xl border border-white/10">
                  <p className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-1">Doctor</p>
                  <p className="font-bold text-white text-sm">Dr. {viewingRx.doctorName}</p>
                </div>
                <div className="p-4 bg-white/5 rounded-3xl border border-white/10">
                  <p className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-1">Date Issued</p>
                  <p className="font-bold text-white text-sm">{new Date(viewingRx.date).toLocaleDateString()}</p>
                </div>
              </div>

              {viewingRx.doctorNote && (
                <div className="p-5 bg-blue-600/20 rounded-[32px] border border-blue-500/30">
                  <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-2">Doctor's Note</p>
                  <p className="text-sm font-medium leading-relaxed italic text-blue-100">"{viewingRx.doctorNote}"</p>
                </div>
              )}

              <div className="flex gap-4 pb-12">
                <button
                  onClick={() => handleEditRx(viewingRx)}
                  className="flex-1 bg-white text-slate-900 font-black py-5 rounded-3xl active:scale-95 transition-all text-xs uppercase tracking-widest"
                >
                  Edit Details
                </button>
                <button
                  onClick={() => handleDeleteRx(viewingRx.id)}
                  className="flex-1 bg-red-600 text-white font-black py-5 rounded-3xl active:scale-95 transition-all text-xs uppercase tracking-widest"
                >
                  Delete Rx
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Doctor Visit Form Modal */}
      {isVisitFormOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-end sm:items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl animate-in slide-in-from-bottom-8 duration-300 max-h-[90vh] overflow-y-auto no-scrollbar">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-slate-800 tracking-tight">{editingVisit ? 'Edit Visit' : 'Schedule Visit'}</h3>
              <button onClick={() => { setIsVisitFormOpen(false); resetVisitForm(); }} className="text-slate-400 p-2 hover:bg-slate-100 rounded-full">✕</button>
            </div>

            <form onSubmit={handleSaveVisit} className="space-y-5">
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Doctor's Name</label>
                  <input
                    required
                    type="text"
                    placeholder="Dr. Smith"
                    className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold"
                    value={visitDoctor}
                    onChange={(e) => setVisitDoctor(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Specialty</label>
                  <input
                    type="text"
                    placeholder="e.g. Cardiologist"
                    className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold"
                    value={visitSpecialty}
                    onChange={(e) => setVisitSpecialty(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Date</label>
                    <input
                      required
                      type="date"
                      className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold"
                      value={visitDate}
                      onChange={(e) => setVisitDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Time</label>
                    <input
                      required
                      type="time"
                      className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold"
                      value={visitTime}
                      onChange={(e) => setVisitTime(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-2xl">
                  <div>
                    <p className="font-bold text-indigo-900 text-sm">Set Reminder</p>
                    <p className="text-[10px] text-indigo-500 font-medium">Alert me when it's time</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setVisitRemindMe(!visitRemindMe)}
                    className={`w-12 h-6 rounded-full transition-colors relative ${visitRemindMe ? 'bg-indigo-600' : 'bg-slate-300'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${visitRemindMe ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Location</label>
                  <input
                    type="text"
                    placeholder="Hospital or Clinic name"
                    className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold"
                    value={visitLocation}
                    onChange={(e) => setVisitLocation(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Reason for visit</label>
                  <textarea
                    placeholder="Symptoms or questions to ask..."
                    className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium resize-none"
                    rows={2}
                    value={visitNotes}
                    onChange={(e) => setVisitNotes(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-indigo-600 text-white font-black py-5 rounded-3xl shadow-xl shadow-indigo-100 active:scale-95 transition-all text-sm uppercase tracking-widest"
              >
                {editingVisit ? 'Update Appointment' : 'Schedule Appointment'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Medication Alarms & Confirmation Modals */}
      {deletingMedId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[32px] p-8 text-center shadow-2xl">
            <h3 className="text-2xl font-black mb-8 text-slate-800">Delete Medication?</h3>
            <button onClick={confirmDelete} className="w-full bg-red-600 text-white font-black py-4 rounded-2xl mb-2 active:scale-95 transition-all shadow-lg shadow-red-100 uppercase tracking-widest text-xs">Yes, Delete</button>
            <button onClick={() => setDeletingMedId(null)} className="w-full bg-slate-100 text-slate-600 font-bold py-4 rounded-2xl active:scale-95 transition-all uppercase tracking-widest text-xs">Cancel</button>
          </div>
        </div>
      )}

      {alertMed && (
        <div className="fixed inset-0 bg-red-600 z-[200] flex items-center justify-center p-8 text-white text-center animate-pulse">
          <div className="space-y-8 w-full max-w-xs">
            <div className="text-9xl">🚨</div>
            <h2 className="text-6xl font-black uppercase tracking-tight">Take {alertMed.name}</h2>
            <button onClick={() => handleLogDose(alertMed.id, 'taken')} className="w-full bg-white text-red-600 font-black py-8 rounded-[40px] text-3xl shadow-2xl active:scale-95 transition-all">I TOOK IT</button>
            <div className="flex gap-4">
              <button onClick={handleSnooze} className="flex-1 bg-red-700/50 text-white font-black py-4 rounded-3xl active:scale-95 transition-all uppercase tracking-widest text-xs">SNOOZE</button>
              <button onClick={() => handleLogDose(alertMed.id, 'skipped')} className="flex-1 bg-red-900/40 text-white font-bold py-4 rounded-3xl active:scale-95 transition-all uppercase tracking-widest text-xs">SKIP</button>
            </div>
          </div>
        </div>
      )}

      {alertVisit && (
        <div className="fixed inset-0 bg-indigo-700 z-[200] flex items-center justify-center p-8 text-white text-center">
          <div className="space-y-8 w-full max-w-xs animate-in zoom-in duration-300">
            <div className="text-9xl">📅</div>
            <h2 className="text-5xl font-black uppercase tracking-tight leading-tight">Visit Dr. {alertVisit.doctorName}</h2>
            <div className="p-6 bg-white/10 rounded-[32px] backdrop-blur-md">
              <p className="font-bold text-lg mb-1">{alertVisit.time}</p>
              <p className="text-sm text-indigo-100">{alertVisit.location || 'Scheduled Appointment'}</p>
            </div>
            <button onClick={() => setAlertVisit(null)} className="w-full bg-white text-indigo-700 font-black py-6 rounded-[40px] text-2xl shadow-2xl active:scale-95 transition-all uppercase tracking-widest">OK, Dismiss</button>
          </div>
        </div>
      )}

      {/* Global Modals */}
      {isSettingsOpen && <SettingsModal settings={settings} updateSettings={setSettings} onClose={() => setIsSettingsOpen(false)} onLogout={handleLogout} />}
      {isRxFormOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-end sm:items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl animate-in slide-in-from-bottom-8 duration-300 max-h-[90vh] overflow-y-auto no-scrollbar">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-slate-800 tracking-tight">{editingRx ? 'Edit Rx' : 'Upload Rx'}</h3>
              <button onClick={() => { setIsRxFormOpen(false); resetRxForm(); }} className="text-slate-400 p-2 hover:bg-slate-100 rounded-full">✕</button>
            </div>

            <form onSubmit={handleSaveRx} className="space-y-5">
              <div onClick={() => rxFileInputRef.current?.click()} className="w-full h-56 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[32px] flex flex-col items-center justify-center cursor-pointer overflow-hidden relative group">
                {rxImage ? (
                  <>
                    <img src={rxImage} alt="Rx" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-white font-bold text-xs">Tap to change</span>
                    </div>
                  </>
                ) : (
                  <div className="text-center">
                    <span className="text-4xl block mb-2">📸</span>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Capture Prescription</p>
                  </div>
                )}
                <input type="file" accept="image/*" ref={rxFileInputRef} className="hidden" onChange={handleRxPhotoUpload} />
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Title</label>
                  <input required type="text" placeholder="e.g. Health Summary" className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold" value={rxTitle} onChange={(e) => setRxTitle(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Doctor</label>
                    <input required type="text" placeholder="Dr. Name" className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold" value={rxDoctor} onChange={(e) => setRxDoctor(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Date</label>
                    <input required type="date" className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold" value={rxDate} onChange={(e) => setRxDate(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Notes</label>
                  <textarea placeholder="Optional instructions..." className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium resize-none" rows={2} value={rxNote} onChange={(e) => setRxNote(e.target.value)} />
                </div>
              </div>

              <button disabled={!rxImage} type="submit" className="w-full bg-blue-600 text-white font-black py-5 rounded-3xl shadow-xl active:scale-95 transition-all text-sm uppercase tracking-widest disabled:opacity-50">
                {editingRx ? 'Update Rx' : 'Securely Save Rx'}
              </button>
            </form>
          </div>
        </div>
      )}
      {isProfileOpen && <ProfileModal profile={userProfile} updateProfile={setUserProfile} userPhoto={userPhoto} setUserPhoto={setUserPhoto} onClose={() => setIsProfileOpen(false)} />}
      {(isFormOpen || editingMed) && <MedicineModal onAdd={handleAddMed} onUpdate={handleUpdateMed} initialData={editingMed} onClose={() => { setIsFormOpen(false); setEditingMed(null); }} />}

      <Navigation activeTab={activeTab} setActiveTab={(tab) => { initAudio(); setActiveTab(tab); }} />
    </div>
  );
};

export default App;
