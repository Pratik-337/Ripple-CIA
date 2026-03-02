import React, { useState, useEffect } from "react";
import { Waves } from "lucide-react";
import { Particles } from "@/src/components/ui/particles";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/src/components/ui/card";
import { authStore } from "@/src/lib/authStore";

// Helper components for icons to ensure correct styling
const IconGithub = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" {...props}><title>GitHub</title><path d="M12 0C5.373 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.085 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.91 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12Z" fill="currentColor" /></svg>
);

interface AuthPageProps {
  onBack?: () => void;
}

export const AuthPage = ({ onBack }: AuthPageProps) => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // If using react-router-dom (if available in App.tsx)
  // Let's rely on window location or navigation callbacks if needed.
  // Actually, App.tsx might just use state based rendering. Let's redirect to / after success.

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      if (isRegister) {
        await authStore.getState().register(name, email, password);
      } else {
        await authStore.getState().login(email, password);
      }
      window.location.href = "/";
    } catch (err: any) {
      setError(err.message || "An authentication error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGithub = () => {
    authStore.getState().loginGithub();
  };

  return (
    <div className="flex min-h-screen w-full overflow-hidden flex-col items-center justify-center bg-black p-4 relative text-white">
      <div className="fixed inset-0 z-0 h-full w-full pointer-events-none">
        <Particles quantity={300} className="absolute inset-0 h-full w-full" color="#ffffff" />
      </div>

      <div className="flex flex-col w-full max-w-md items-center justify-center origin-center relative z-10">
        <div className="mb-8 flex items-center gap-2 cursor-pointer" onClick={() => window.location.href = "/"}>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-black">
            <Waves className="h-5 w-5" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">Ripple</span>
        </div>

        <Card className="w-full bg-zinc-950 border-zinc-800 text-zinc-100 shadow-2xl animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl font-bold tracking-tight">
              {isRegister ? "Create an account" : "Welcome back"}
            </CardTitle>
            <CardDescription className="text-zinc-400">
              {isRegister ? "Enter your details to register" : "Enter your credentials to access your account"}
            </CardDescription>
          </CardHeader>

          <CardContent className="grid gap-4 mt-4 text-zinc-300">
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              {isRegister && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Display Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white transition"
                    required
                  />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white transition"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white transition"
                  required
                />
              </div>

              {error && <div className="text-sm text-red-500 mt-1">{error}</div>}

              <Button type="submit" className="w-full mt-2 bg-white text-black hover:bg-zinc-200" disabled={isLoading}>
                {isLoading ? "Please wait..." : (isRegister ? "Sign Up" : "Sign In")}
              </Button>
            </form>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-zinc-800" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-zinc-950 px-2 text-zinc-500">or continue with</span>
              </div>
            </div>

            <Button variant="outline" className="w-full border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-white" onClick={handleGithub}>
              <IconGithub className="mr-2 h-4 w-4" />
              GitHub
            </Button>
          </CardContent>

          <CardFooter className="flex flex-col pt-4">
            <div className="text-sm text-zinc-400">
              {isRegister ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                className="font-medium text-white hover:underline cursor-pointer"
                onClick={() => setIsRegister(!isRegister)}
              >
                {isRegister ? "Sign In" : "Sign Up"}
              </button>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};
