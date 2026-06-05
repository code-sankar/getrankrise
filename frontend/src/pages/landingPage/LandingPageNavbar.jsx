import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import logo from "../../assets/logo.png";

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#020308]/80 backdrop-blur-md border-b border-gray-900">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="logo" className="w-8 h-8 sm:w-9 sm:h-8" />
            <span className="text-white font-bold text-lg tracking-tight">GetRankRise</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-gray-400 hover:text-white transition-colors">Features</a>
            <a href="#demo" className="text-sm text-gray-400 hover:text-white transition-colors">Demo</a>
            <a href="#pricing" className="text-sm text-gray-400 hover:text-white transition-colors">Pricing</a>
            <a href="#customers" className="text-sm text-gray-400 hover:text-white transition-colors">Customers</a>
          </div>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-4">
            <Link to="/login" className="text-sm text-gray-400 hover:text-white transition-colors">Sign In</Link>
            <Link to="/signup" className="bg-white text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-200 transition-all">
              Start free
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <button onClick={() => setIsOpen(!isOpen)} className="text-gray-400 hover:text-white">
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden bg-[#030712] border-b border-gray-900 px-4 pt-2 pb-6 space-y-4">
          <a href="#features"  onClick={() => setIsOpen(false)} className="block text-base text-gray-400 hover:text-white">Features</a>
          <a href="#demo"      onClick={() => setIsOpen(false)} className="block text-base text-gray-400 hover:text-white">Demo</a>
          <a href="#pricing"   onClick={() => setIsOpen(false)} className="block text-base text-gray-400 hover:text-white">Pricing</a>
          <a href="#customers" onClick={() => setIsOpen(false)} className="block text-base text-gray-400 hover:text-white">Customers</a>
          <hr className="border-gray-900" />
          <div className="flex flex-col gap-3">
            <Link
              to="/login"
              onClick={() => setIsOpen(false)}
              className="text-left text-base text-gray-400 hover:text-white py-2"
            >
              Sign in
            </Link>
            <Link
              to="/signup"
              onClick={() => setIsOpen(false)}
              className="bg-white text-black text-center text-base font-medium py-2.5 rounded-lg"
            >
              Start free
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}