import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { Header } from "@/components/Header";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-white">
      <Header />
      <div className="flex items-center justify-center px-4 py-32">
        <div className="text-center max-w-md">
          <div className="text-6xl font-bold bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent mb-4">
            404
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Page not found
          </h1>
          <p className="text-slate-600 mb-8">
            Sorry, the page you're looking for doesn't exist. Let's get you back
            on track.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-medium rounded-xl hover:shadow-lg transition-all"
          >
            Back to Home
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
