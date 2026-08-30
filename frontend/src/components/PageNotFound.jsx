import not_found from "../assets/Not_Found.png";
import Button from "./Button";
import { Link } from "react-router-dom";

function PageNotFound() {
    return (
        <div className="h-screen w-full flex flex-col items-center justify-center bg-[#0a0a0a] text-white p-5 overflow-hidden">
            {/* The Visuals */}
            <div className="relative group">
                {/* Decorative Glow */}
                <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
                
                <span className="relative rounded-2xl overflow-hidden block animate-bounce-slow">
                    <img
                        src={not_found}
                        alt="404 Astronaut Lost"
                        className="w-80 h-80 md:w-96 md:h-96 object-cover transform transition-transform duration-500 hover:scale-105"
                    />
                </span>
            </div>

            {/* The Funny Stuff */}
            <div className="text-center mt-8 space-y-3">
                <h2 className="text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500">
                    404
                </h2>
                <p className="text-pink-500 font-mono text-lg uppercase tracking-widest">
                    Houston, we have a problem.
                </p>
                <p className="text-gray-400 max-w-md mx-auto italic">
                    "I took a wrong turn at Albuquerque and ended up in this dark, 
                    empty void. It's quiet here. Too quiet."
                </p>
            </div>

            {/* The Escape Hatch */}
            <div className="mt-10">
                <Link to="/dashboard">
                    <Button 
                        className="px-8 py-3 rounded-full font-bold uppercase tracking-tighter transition-all hover:scale-110 active:scale-95 shadow-[0_0_20px_rgba(219,39,119,0.3)] hover:shadow-pink-500/50" 
                        bgColor="bg-pink-600"
                    >
                        Beam Me Home
                    </Button>
                </Link>
            </div>

            {/* Background Details */}
            <div className="absolute top-10 left-10 w-2 h-2 bg-white rounded-full animate-pulse opacity-20"></div>
            <div className="absolute bottom-20 right-20 w-3 h-3 bg-pink-500 rounded-full animate-ping opacity-10"></div>
        </div>
    );
}

export default PageNotFound;