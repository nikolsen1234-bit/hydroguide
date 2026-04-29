import hydroGuideLogoBlack from "../assets/hydroguide-logo-black.svg";

export default function HydroGuideLogo({
  className = "h-[70px] w-[256px] object-contain"
}: {
  className?: string;
}) {
  return <img src={hydroGuideLogoBlack} alt="HydroGuide logo" width={256} height={70} className={className} />;
}
