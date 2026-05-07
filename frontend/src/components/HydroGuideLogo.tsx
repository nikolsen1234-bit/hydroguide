type HydroGuideLogoProps = {
  variant?: "black" | "white";
  className?: string;
};

export default function HydroGuideLogo({ variant = "black", className = "" }: HydroGuideLogoProps) {
  return (
    <img
      src={variant === "white" ? "/hydroguide-logo-white.svg" : "/hydroguide-logo-black.svg"}
      alt=""
      aria-hidden="true"
      className={`block h-auto w-full ${className}`.trim()}
      draggable={false}
    />
  );
}
