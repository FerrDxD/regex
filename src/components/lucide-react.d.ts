declare module 'lucide-react' {
  import { SVGAttributes, ForwardRefExoticComponent, RefAttributes } from 'react';

  export interface LucideIconProps extends SVGAttributes<SVGSVGElement> {
    size?: number;
    strokeWidth?: number;
    absoluteStrokeWidth?: boolean;
    color?: string;
  }

  export type LucideIcon = ForwardRefExoticComponent<LucideIconProps & RefAttributes<SVGSVGElement>>;

  export const Monitor: LucideIcon;
  export const Smartphone: LucideIcon;
  export const Copy: LucideIcon;
  export const Camera: LucideIcon;
  export const QrCode: LucideIcon;
  export const X: LucideIcon;
  export const ChevronRight: LucideIcon;
  export const Check: LucideIcon;
  // Add other icons as needed
}