import { useState } from 'react';
import { Send, Star } from 'lucide-react';

export default function Demo() {
  const [tone, setTone] = useState('Warm');
  const [isGenerating, setIsGenerating] = useState(false);
  const [reviewInput, setReviewInput] = useState(
    "We took our daughter in for her first cleaning and the staff was so patient with her. The office is spotless and Dr. Chen explained everything clearly. Will definitely be back!"
  );
  const [aiOutput, setAiOutput] = useState(
    "Thank you so much for the kind words — it truly made our day to read this. We love getting to care for families like yours, and we'll pass your note along to Dr. Chen and the team. See you at the next visit!"
  );

  const handleGenerate = () => {
    setIsGenerating(true);
    setTimeout(() => {
      if (tone === 'Warm') {
        setAiOutput("Thank you so much for the kind words — it truly made our day to read this. We love getting to care for families like yours, and we'll pass your note along to Dr. Chen and the team. See you at the next visit!");
      } else if (tone === 'Professional') {
        setAiOutput("Thank you for your review. We appreciate your positive feedback regarding our team's clinical approach and office environment. We look forward to providing your family with continued high-quality care.");
      } else {
        setAiOutput("Thanks for the great feedback! Glad we could make your daughter's first cleaning smooth. See you next time!");
      }
      setIsGenerating(false);
    }, 600);
  };

  return (
    <section id="demo" className="bg-[#030712] py-20 text-white border-t border-slate-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <span className="text-[13px] text-slate-400 uppercase tracking-widest font-semibold">Live Demo</span>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mt-2 mb-4">Try the AI Responder.</h2>
        <p className="text-slate-400 text-xs sm:text-sm max-w-xl mx-auto mb-12 leading-relaxed">
          Paste a real review. Watch Kirtify craft an on-brand reply in seconds — the exact UX your team uses every day.
        </p>

        {/* Demo Interface Card */}
        <div className="group bg-[#080c14] border border-slate-900/80 hover:border-slate-800 rounded-xl grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-900/80 text-left overflow-hidden hover:shadow-[0_0_40px_rgba(59,130,246,0.07)] transition-all duration-500">
          {/* Input Box Column */}
          <div className="p-6 flex flex-col justify-between min-h-[300px]">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-white">
                  <div className="flex text-white scale-90 gap-0.5 cursor-default">
                    {[...Array(5)].map((_, i) => <Star key={i} size={11} fill="currentColor" className="hover:text-yellow-400 hover:scale-125 transition-all duration-300" />)}
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">5-star review</span>
                </div>
                <span className="text-[9px] text-slate-400 tracking-wider uppercase font-semibold">Input</span>
              </div>
              <textarea
                className="w-full bg-transparent text-xs text-slate-400 focus:text-white resize-none outline-none focus:ring-0 leading-relaxed h-32 transition-colors duration-300"
                value={reviewInput}
                onChange={(e) => setReviewInput(e.target.value)}
              />
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-900/40">
              <div className="flex gap-1 items-center bg-[#030712] border border-slate-900 p-0.5 rounded-lg text-[10px]">
                {['Warm', 'Professional', 'Concise'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTone(t)}
                    className={`px-2.5 py-1 rounded-md font-medium transition-all duration-300 ${tone === t ? 'bg-white text-black shadow-sm scale-105' : 'text-slate-400 hover:text-slate-300 hover:bg-[#111827]'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="bg-white text-black text-[11px] font-bold px-3 py-1.5 rounded-lg hover:bg-slate-200 hover:scale-105 active:scale-95 transition-all duration-300 shadow-sm"
              >
                {isGenerating ? 'Generating...' : '✨ Generate'}
              </button>
            </div>
          </div>

          {/* Output Box Column */}
          <div className="p-6 flex flex-col justify-between bg-[#050910] group-hover:bg-[#060a12] transition-colors duration-500 min-h-[300px]">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-200">
                  <div className="w-4 h-4 bg-white/10 rounded flex items-center justify-center text-[9px] group-hover:rotate-12 group-hover:scale-110 transition-transform duration-300">✨</div>
                  AI suggested reply
                </div>
                <span className="text-[9px] text-slate-400 tracking-wider uppercase font-semibold">Output</span>
              </div>
              <p className={`text-xs leading-relaxed transition-all duration-500 ${isGenerating ? 'opacity-40 animate-pulse blur-[1px]' : 'text-slate-300 blur-0'}`}>
                {aiOutput}
              </p>
            </div>

            {/* Action Bottom Controls */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-900/40">
              <button onClick={handleGenerate} className="text-slate-400 hover:text-white text-[10px] font-medium transition-colors duration-300">
                Regenerate
              </button>
              <button className="group/btn bg-[#2563eb] text-white text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-cyan-600 hover:scale-105 active:scale-95 hover:shadow-[0_0_15px_rgba(37,99,235,0.4)] transition-all duration-300">
                <Send size={10} className="group-hover/btn:-translate-y-0.5 group-hover/btn:translate-x-0.5 transition-transform duration-300" />
                Post to Google
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}