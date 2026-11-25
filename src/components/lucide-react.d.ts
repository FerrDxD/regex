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
  export const Download: LucideIcon;
  export const File: LucideIcon;
  export const FileText: LucideIcon;
  export const Upload: LucideIcon;
  export const Send: LucideIcon;
  export const CheckCircle: LucideIcon;
  export const AlertCircle: LucideIcon;
  // Add other icons as needed
}