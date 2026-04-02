import { useState, useEffect, useRef } from 'react';
import { Activity, AlertCircle, Loader2, CheckCircle2, Wifi, WifiOff } from 'lucide-react';
import CalculatorForm from './components/CalculatorForm';
import ResultDisplay from './components/ResultDisplay';
import {
  connect, disconnect, sendCalculation, onResult, onError, isConnected, getWebSocketUrl,
  getCachedResult,
} from './api/calculationService';

function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState(null); // 'connecting' | 'submitting' | 'processing' | 'done'
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(false);
  const lastSubmission = useRef(null);
  const wsUrl = getWebSocketUrl();

  useEffect(() => {
    if (!wsUrl) return;

    onResult((data) => {
      // Merge submitted form data with server result so ResultDisplay always has all fields
      const merged = { ...lastSubmission.current, ...data };
      setResult(merged);
      setStatus('done');
      setIsLoading(false);
    });

    onError((err) => {
      setError(err.message || 'Calculation failed');
      setStatus(null);
      setIsLoading(false);
    });

    connect()
      .then(() => setConnected(true))
      .catch((err) => {
        console.error('WebSocket connect failed:', err);
        setConnected(false);
      });

    return () => disconnect();
  }, [wsUrl]);

  const handleSubmit = async (formData) => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    lastSubmission.current = formData;

    // Check client-side cache first
    const cached = getCachedResult(formData);
    if (cached) {
      const merged = { ...formData, ...cached };
      setResult(merged);
      setStatus('done');
      setIsLoading(false);
      return;
    }

    if (!isConnected()) {
      try {
        setStatus('connecting');
        await connect();
        setConnected(true);
      } catch (err) {
        setError('Failed to connect to server');
        setStatus(null);
        setIsLoading(false);
        return;
      }
    }

    try {
      setStatus('submitting');
      sendCalculation(formData);
      setStatus('processing');
    } catch (err) {
      setStatus(null);
      setError(err.message || 'Something went wrong');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 rounded-lg p-2">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">CompoundCalc</h1>
              <p className="text-xs text-slate-500">Kafka-Powered Interest Calculator</p>
            </div>
          </div>
          <span className={`hidden sm:inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1 ${
            connected
              ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
              : 'text-slate-500 bg-slate-50 border border-slate-200'
          }`}>
            {connected ? (
              <><Wifi className="w-3 h-3" /><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /> Connected</>
            ) : (
              <><WifiOff className="w-3 h-3" /> Disconnected</>
            )}
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Title Section */}
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-3">
            Compound Interest Calculator
          </h2>
          <p className="text-slate-500 max-w-lg mx-auto">
            Calculate your investment growth with compound interest. Powered by Apache Kafka
            for real-time, high-throughput processing and AWS Lambda for serverless computation.
          </p>
        </div>

        {/* Architecture Badge */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {['React', 'WebSocket', 'Apache Kafka', 'AWS Lambda', 'CloudFront'].map((tech) => (
            <span
              key={tech}
              className="inline-flex items-center text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-3 py-1"
            >
              {tech}
            </span>
          ))}
        </div>

        {/* Calculator Card */}
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-6 sm:p-8">
          <CalculatorForm onSubmit={handleSubmit} isLoading={isLoading} />

          {/* Error Display */}
          {/* Processing Status */}
          {isLoading && (
            <div className="mt-6 flex items-center gap-3 rounded-lg bg-indigo-50 border border-indigo-200 p-4">
              <Loader2 className="w-5 h-5 text-indigo-500 animate-spin flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-indigo-800">
                  {status === 'connecting' ? 'Connecting to server...' : status === 'submitting' ? 'Sending calculation...' : 'Processing via Kafka & Lambda...'}
                </p>
                <p className="text-xs text-indigo-500 mt-0.5">
                  {status === 'connecting'
                    ? 'Establishing WebSocket connection'
                    : status === 'submitting'
                    ? 'Sending request via WebSocket'
                    : 'Your request is being processed by AWS Lambda through Kafka'}
                </p>
              </div>
            </div>
          )}

          {status === 'done' && result && (
            <div className="mt-6 flex items-center gap-3 rounded-lg bg-emerald-50 border border-emerald-200 p-4">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
              <p className="text-sm font-medium text-emerald-800">Calculation completed successfully</p>
            </div>
          )}

          {error && (
            <div className="mt-6 flex items-start gap-3 rounded-lg bg-red-50 border border-red-200 p-4">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">Calculation Failed</p>
                <p className="text-sm text-red-600 mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Result Display */}
          <ResultDisplay result={result} />
        </div>

        {/* How It Works */}
        <div className="mt-12 text-center">
          <h3 className="text-lg font-semibold text-slate-800 mb-6">How It Works</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { step: '1', title: 'Submit', desc: 'Enter your parameters — sent instantly via WebSocket' },
              { step: '2', title: 'Queue', desc: 'Lambda API publishes the event to Apache Kafka' },
              { step: '3', title: 'Compute & Push', desc: 'Calculator Lambda processes the event and pushes the result back via WebSocket' },
            ].map((item) => (
              <div key={item.step} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="w-8 h-8 bg-indigo-100 text-indigo-700 font-bold rounded-full flex items-center justify-center mx-auto mb-3 text-sm">
                  {item.step}
                </div>
                <h4 className="font-semibold text-slate-800 mb-1">{item.title}</h4>
                <p className="text-sm text-slate-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 mt-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center text-sm text-slate-400">
          CompoundCalc &mdash; Built with React, WebSocket API, Apache Kafka &amp; AWS Lambda
        </div>
      </footer>
    </div>
  );
}

export default App;
