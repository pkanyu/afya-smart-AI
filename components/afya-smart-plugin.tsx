'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Mic, Download, VolumeX, Volume2, AlertCircle } from 'lucide-react'

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function AfyaSmartPlugin() {
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState<Array<{ text: string; isDoctor: boolean }>>([])
  const [symptoms, setSymptoms] = useState<string[]>([])
  const [diagnosis, setDiagnosis] = useState<string>('')
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [hasNetworkError, setHasNetworkError] = useState(false)
  const [diagnosticsLog, setDiagnosticsLog] = useState<string[]>([])

  const recognitionRef = useRef<any>(null)
  const synthRef = useRef<SpeechSynthesis | null>(null)
  const retryAttemptsRef = useRef(0)
  const MAX_RETRY_ATTEMPTS = 3

  // Test WebSocket connection
  const testWebSocket = () => {
    try {
      const ws = new WebSocket('wss://echo.websocket.org');
      ws.onopen = () => {
        setDiagnosticsLog(prev => [...prev, '✅ WebSocket connection successful']);
        ws.close();
      };
      ws.onerror = (error) => {
        setDiagnosticsLog(prev => [...prev, '❌ WebSocket error: Connection failed']);
      };
    } catch (error) {
      setDiagnosticsLog(prev => [...prev, `❌ WebSocket test error: ${error}`]);
    }
  };

  // Check network configuration
  const checkNetworkConfig = async () => {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      setDiagnosticsLog(prev => [...prev, `✅ Network config: IP detected`]);
    } catch (error) {
      setDiagnosticsLog(prev => [...prev, `❌ Network config test error`]);
    }
  };

  // Run all diagnostics
  const runDiagnostics = async () => {
    setDiagnosticsLog([]);
    
    // Test 1: Browser Support
    setDiagnosticsLog(prev => [...prev, '🔍 Testing browser support...']);
    const browserSupport = {
      speechRecognition: 'SpeechRecognition' in window,
      webkitSpeechRecognition: 'webkitSpeechRecognition' in window,
      mediaDevices: 'mediaDevices' in navigator
    };
    
    setDiagnosticsLog(prev => [...prev, 
      `${browserSupport.speechRecognition || browserSupport.webkitSpeechRecognition ? '✅' : '❌'} Speech Recognition: ${
        browserSupport.speechRecognition || browserSupport.webkitSpeechRecognition ? 'Supported' : 'Not supported'
      }`,
      `${browserSupport.mediaDevices ? '✅' : '❌'} Media Devices: ${browserSupport.mediaDevices ? 'Supported' : 'Not supported'}`
    ]);

    // Test 2: Microphone Permission
    setDiagnosticsLog(prev => [...prev, '🔍 Testing microphone permission...']);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setDiagnosticsLog(prev => [...prev, '✅ Microphone Permission: Granted']);
      stream.getTracks().forEach(track => track.stop());
    } catch (error) {
      setDiagnosticsLog(prev => [...prev, `❌ Microphone Permission: ${error}`]);
    }

    // Test 3: Network Connectivity
    setDiagnosticsLog(prev => [...prev, '🔍 Testing network connectivity...']);
    try {
      const response = await fetch('https://www.google.com');
      setDiagnosticsLog(prev => [
        ...prev, 
        `${response.ok ? '✅' : '❌'} Network Connectivity: ${response.ok ? 'Connected' : 'Not Connected'}`
      ]);
    } catch (error) {
      setDiagnosticsLog(prev => [...prev, `❌ Network Connectivity Error`]);
    }

    // Test 4: WebSocket Support
    setDiagnosticsLog(prev => [...prev, '🔍 Testing WebSocket connection...']);
    await testWebSocket();

    // Test 5: Network Configuration
    setDiagnosticsLog(prev => [...prev, '🔍 Testing network configuration...']);
    await checkNetworkConfig();
  };

  // Initialize speech recognition
  const initializeRecognition = () => { 
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = 'en-US';
    recognitionRef.current.maxAlternatives = 1;

    recognitionRef.current.onstart = () => {
      console.log('Speech recognition started');
      setIsRecording(true);
      setHasNetworkError(false);
    };

    recognitionRef.current.onresult = (event: any) => {
      const current = event.resultIndex;
      const transcript = event.results[current][0].transcript;
      console.log('Transcript received:', transcript);
      
      const isDoctor = transcript.toLowerCase().includes('doctor');
      setTranscript(prev => [...prev, { text: transcript, isDoctor }]);

      if (!isDoctor) {
        const newSymptoms = transcript.toLowerCase().match(/headache|fever|pain|cough|nausea/g) || [];
        setSymptoms(prev => [...new Set([...prev, ...newSymptoms])]);
      }

      retryAttemptsRef.current = 0;
    };

    recognitionRef.current.onerror = (event: any) => {
      console.log('Speech recognition error:', event.error);
      
      if (event.error === 'network') {
        setHasNetworkError(true);
        handleNetworkError();
      } else if (event.error === 'not-allowed') {
        alert('Microphone permission is required for speech recognition.');
        setIsRecording(false);
      } else {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
      }
    };

    recognitionRef.current.onend = () => {
      console.log('Speech recognition ended');
      if (isRecording && !hasNetworkError) {
        try {
          recognitionRef.current.start();
        } catch (e) {
          console.error('Failed to restart speech recognition');
          setIsRecording(false);
        }
      }
    };
  };

  const handleNetworkError = () => {
    if (retryAttemptsRef.current < MAX_RETRY_ATTEMPTS) {
      retryAttemptsRef.current++;
      console.log(`Retrying speech recognition (attempt ${retryAttemptsRef.current})`);
      
      setTimeout(() => {
        if (recognitionRef.current) {
          try {
            recognitionRef.current.stop();
            initializeRecognition();
            recognitionRef.current.start();
          } catch (e) {
            console.error('Failed to retry speech recognition:', e);
          }
        }
      }, 2000);
    } else {
      console.log('Max retry attempts reached');
      setIsRecording(false);
      alert('Network connection is unstable. Please check your internet connection and try again.');
    }
  };

  // Initialize speech synthesis and recognition
  useEffect(() => {
    if ('speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech Recognition is not supported in this browser. Please use Chrome.');
      return;
    }

    const setupRecognition = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        initializeRecognition();
      } catch (error) {
        console.error('Microphone permission denied:', error);
        alert('Microphone permission is required for speech recognition to work.');
      }
    };

    setupRecognition();

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // Update diagnosis when symptoms change
  useEffect(() => {
    if (symptoms.length > 0) {
      setDiagnosis(`Based on the symptoms (${symptoms.join(', ')}), the patient may have a viral infection. Further tests recommended.`);
    }
  }, [symptoms]);

  const toggleRecording = async () => {
    try {
      if (isRecording) {
        recognitionRef.current?.stop();
        setIsRecording(false);
      } else {
        retryAttemptsRef.current = 0;
        await navigator.mediaDevices.getUserMedia({ audio: true });
        recognitionRef.current?.start();
        setIsRecording(true);
      }
    } catch (error) {
      console.error('Error toggling recording:', error);
      alert('Failed to access microphone. Please ensure you have granted microphone permissions.');
      setIsRecording(false);
    }
  };

  const speakDiagnosis = () => {
    if (!synthRef.current || !diagnosis) {
      console.error('Speech synthesis not initialized or no diagnosis available');
      return;
    }

    try {
      if (isSpeaking) {
        synthRef.current.cancel();
        setIsSpeaking(false);
      } else {
        synthRef.current.cancel();
        const utterance = new SpeechSynthesisUtterance(diagnosis);
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = (event) => {
          console.error('Speech synthesis error:', event);
          setIsSpeaking(false);
        };
        synthRef.current.speak(utterance);
      }
    } catch (error) {
      console.error('Error in speech synthesis:', error);
      setIsSpeaking(false);
    }
  };

  const downloadReport = () => {
    const report = `
      Afya Smart Medical Report
      
      Transcript:
      ${transcript.map(t => `${t.isDoctor ? 'Doctor' : 'Patient'}: ${t.text}`).join('\n')}
      
      Symptoms: ${symptoms.join(', ')}
      
      AI Diagnosis: ${diagnosis}
    `;
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'medical_report.txt';
    a.click();
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <aside className="w-1/4 bg-[#1a3b5d] p-4 text-white">
        <img src="/afya-smart.jpg" alt="Afya Smart Logo" className="mb-4" />
        <h2 className="text-xl font-bold mb-4">Symptoms</h2>
        <ul>
          {symptoms.map((symptom, index) => (
            <li key={index} className="mb-2 p-2 bg-[#3a5b7d] rounded">{symptom}</li>
          ))}
        </ul>
      </aside>
      <main className="flex-1 p-4">
        <Card className="h-full flex flex-col">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-[#1a3b5d]">Afya Smart Consultation</CardTitle>
              <Button 
                onClick={runDiagnostics}
                className="bg-orange-500 hover:bg-orange-600"
              >
                <AlertCircle className="mr-2" />
                Run Diagnostics
              </Button>
            </div>
          </CardHeader>
          
          {/* Diagnostics log display */}
          {diagnosticsLog.length > 0 && (
            <div className="mx-6 mb-4 p-4 bg-gray-100 rounded-lg overflow-y-auto max-h-40">
              <h3 className="font-bold mb-2">Diagnostic Results:</h3>
              {diagnosticsLog.map((log, index) => (
                <div key={index} className="text-sm font-mono mb-1">
                  {log}
                </div>
              ))}
            </div>
          )}

          <CardContent className="flex-1 overflow-y-auto">
            {hasNetworkError && (
              <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4">
                Experiencing network issues. Attempting to reconnect...
              </div>
            )}
            {transcript.map((entry, index) => (
              <div key={index} className={`mb-2 p-2 rounded ${entry.isDoctor ? 'bg-[#e8f0fe] text-[#1a3b5d]' : 'bg-[#ffe8f0] text-[#5d1a3b]'}`}>
                <strong>{entry.isDoctor ? 'Doctor' : 'Patient'}:</strong> {entry.text}
              </div>
            ))}
          </CardContent>
          <CardFooter className="flex justify-between items-center">
            <Button 
              onClick={toggleRecording} 
              className={`${isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-[#1a3b5d] hover:bg-[#3a5b7d]'}`}
            >
              <Mic className="mr-2" />
              {isRecording ? 'Stop Recording' : 'Start Recording'}
            </Button>
            <Button onClick={downloadReport} className="bg-[#5d1a3b] hover:bg-[#7d3a5b]">
              <Download className="mr-2" /> Download Report
            </Button>
          </CardFooter>
        </Card>
      </main>
      <aside className="w-1/4 bg-[#f0f4f8] p-4">
        <h2 className="text-xl font-bold mb-4 text-[#1a3b5d]">AI Diagnosis</h2>
        <p className="text-[#3a5b7d] mb-4">{diagnosis}</p>
        <Button 
          onClick={speakDiagnosis} 
          className="bg-[#1a3b5d] hover:bg-[#3a5b7d]"
          disabled={!diagnosis}
        >
          {isSpeaking ? <VolumeX className="mr-2" /> : <Volume2 className="mr-2" />}
          {isSpeaking ? 'Stop Speaking' : 'Speak Diagnosis'}
        </Button>
      </aside>
    </div>
  );
}