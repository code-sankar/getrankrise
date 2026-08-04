import Navbar from './LandingPageNavbar.jsx';
import Hero from './LandingPageHero.jsx';
import Logos from './Logos.jsx';
import Features from './LandingPageFeatures.jsx';
import Demo from './LandingPageDemo.jsx';
import Outcomes from './LandingPageOutcomes.jsx';
import Pricing from './Pricing.jsx';
import Footer from './LandingPageFooter.jsx';


function LandingPage() {
  return (
    <div className="min-h-screen bg-[#030712] font-sans selection:bg-blue-500/30 selection:text-white antialiased">
      <Navbar />
      <Hero />
      <Logos />
      <Features />
      <Demo />
      <Outcomes />
      <Pricing />
      <Footer />
    </div>
  )
}

export default LandingPage