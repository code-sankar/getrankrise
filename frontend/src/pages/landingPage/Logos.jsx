
export default function Logos() {
  const companies = ['BrightSmile', 'Luxe Salon', 'Trattoria 9', 'PeakFit', 'Northside Clinic', 'HomeCo'];

  return (
    <section id="customers" className="bg-[#04060d] py-12 border-b border-slate-900">
      <div className="max-w-7xl mx-auto px-4 text-center">
        <p className="text-xs text-slate-400 uppercase tracking-[0.2em] font-semibold mb-8">
          Trusted by ambitious local teams in 24 countries
        </p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8 items-center justify-center opacity-40">
          {companies.map((company) => (
            <span key={company} className="text-white font-semibold text-sm sm:text-base tracking-tight hover:opacity-100 transition-opacity cursor-default">
              {company}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}