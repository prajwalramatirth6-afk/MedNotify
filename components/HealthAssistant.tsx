
import React, { useState, useRef, useEffect } from 'react';
import { UserProfile, Medication, ChatMessage } from '../types';
import { chatWithAIDoctor } from '../services/geminiService';
import { queryN8nHealthAssistant } from '../services/n8nService';

interface HealthAssistantProps {
  profile: UserProfile;
  meds: Medication[];
}

const HealthAssistant: React.FC<HealthAssistantProps> = ({ profile, meds }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'model', text: 'Hello! I am your AI Health Assistant. I am monitoring your profile for potential drug-drug interactions and allergy risks. How can I assist you today?' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = async (text: string = input) => {
    const trimmedInput = text.trim();
    if (!trimmedInput || isTyping) return;

    const userMsg: ChatMessage = { role: 'user', text: trimmedInput };
    const historyForAPI = [...messages];
    
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      // First attempt request through n8n automation pipeline
      let response: string | null | undefined = await queryN8nHealthAssistant(trimmedInput, historyForAPI, profile, meds);

      // If n8n returns no content (e.g. test webhook waiting or respond immediately without body),
      // seamlessly fallback to direct Gemini model inference
      if (!response) {
        response = await chatWithAIDoctor(trimmedInput, historyForAPI, profile, meds);
      }

      const modelMsg: ChatMessage = { role: 'model', text: response || 'I am sorry, I could not process that.' };
      setMessages(prev => [...prev, modelMsg]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'model', text: 'Technical error: Unable to reach AI safety database. Please try again.' }]);
    } finally {
      setIsTyping(false);
    }
  };

  const suggestions = [
    "Check for drug interactions",
    "Is this safe for me?",
    "Allergy risk assessment",
    "Side effects for my list"
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="px-6 py-4 bg-white border-b border-slate-100 shrink-0">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">AI Doctor 🩺</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Interaction & Allergy Guard</p>
          </div>
          <div className="flex items-center space-x-2">
            <div className="bg-purple-50 px-2.5 py-1.5 rounded-full border border-purple-100 flex items-center space-x-1" title="Connected to n8n automation workflow">
              <span className="text-[10px]">⚡</span>
              <span className="text-[8px] font-black text-purple-700 uppercase">n8n Connected</span>
            </div>
            <div className="bg-green-50 px-3 py-1.5 rounded-full border border-green-100 flex items-center space-x-1.5">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-[8px] font-black text-green-700 uppercase">Profile Sync Active</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 no-scrollbar bg-slate-50" ref={scrollRef}>
        <div className="bg-indigo-600/5 border border-indigo-600/10 p-4 rounded-2xl mb-6">
          <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-widest flex items-center mb-1">
            <span className="mr-2">🛡️</span> Safety Awareness Enabled
          </p>
          <p className="text-xs text-indigo-900/60 leading-relaxed font-medium">
            I am cross-referencing your queries against: <strong>{meds.length} Active Meds</strong> and your <strong>{profile.allergies ? 'documented allergies' : 'health history'}</strong>.
          </p>
        </div>

        {messages.map((m, i) => {
          const isWarning = m.text.includes('⚠️') || m.text.includes('INTERACTION ALERT') || m.text.includes('RISK');
          return (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[88%] p-4 rounded-3xl text-sm leading-relaxed shadow-sm transition-all ${
                m.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-tr-none' 
                  : `bg-white text-slate-700 rounded-tl-none border ${isWarning ? 'border-amber-400 bg-amber-50/30' : 'border-slate-100'}`
              }`}>
                {m.text.split('\n').map((line, idx) => (
                  <p key={idx} className={`${idx > 0 ? 'mt-2' : ''} ${line.includes('⚠️') ? 'font-black text-amber-800' : ''}`}>
                    {line}
                  </p>
                ))}
                {m.role === 'model' && (
                  <div className="mt-3 pt-3 border-t border-slate-50 flex items-center">
                    <span className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[10px] mr-2 shrink-0">🛡️</span>
                    <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Clinical Analysis Mode</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-100 p-4 rounded-3xl rounded-tl-none shadow-sm flex items-center space-x-2">
              <div className="flex space-x-1">
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
              </div>
              <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-2">Checking Safety Database</span>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 bg-white border-t border-slate-100 shrink-0">
        <div className="flex overflow-x-auto gap-2 no-scrollbar mb-4">
          {suggestions.map(s => (
            <button 
              key={s} 
              disabled={isTyping}
              onClick={() => handleSend(s)}
              className="px-4 py-2 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-slate-600 hover:text-indigo-600 text-[10px] font-black uppercase rounded-full transition-all whitespace-nowrap active:scale-95 disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex items-center space-x-3 bg-slate-100 p-1.5 rounded-[24px]">
          <input 
            type="text" 
            placeholder="Ask: 'Can I take Ibuprofen with my current meds?'" 
            className="flex-1 bg-transparent py-3 px-4 text-sm font-bold text-slate-700 outline-none placeholder:text-slate-400"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          />
          <button 
            disabled={!input.trim() || isTyping}
            onClick={() => handleSend()}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-90 ${
              input.trim() && !isTyping ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-200 text-slate-400'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        <p className="text-[8px] font-bold text-center text-slate-300 uppercase tracking-widest mt-3">
          Verification against 10,000+ drug classes. Always consult a real doctor.
        </p>
      </div>
    </div>
  );
};

export default HealthAssistant;
