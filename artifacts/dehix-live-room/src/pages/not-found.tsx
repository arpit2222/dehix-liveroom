import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const [, navigate] = useLocation();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="text-6xl font-bold font-mono text-primary/20 mb-4">404</div>
        <h1 className="text-xl font-bold text-foreground mb-2">Page not found</h1>
        <p className="text-muted-foreground text-sm mb-6">The page you're looking for doesn't exist.</p>
        <Button onClick={() => navigate("/")}>Go home</Button>
      </div>
    </div>
  );
}
