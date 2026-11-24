export interface User {
  id: string;
  name: string;
  email: string;
  provider: "google" | "email";
  avatar?: string;
  createdAt: string;
  /**
   * WhatsApp number in E.164 form ("+5511912345678").
   *
   * Required to use the product: it is the only way to contact another person,
   * so an account without a number can browse but cannot publish or start a
   * conversation. Accounts created before this field existed may lack it, which
   * is why it is optional in the type and enforced at the point of use.
   */
  whatsapp?: string;
  /** Set when the user finishes the first-visit wizard. */
  onboarding?: OnboardingProfile;
}

/** What the user told us in the onboarding wizard. */
export interface OnboardingProfile {
  completedAt: string;
  /** The car they have. Loosely typed: it is a shortlist, not a listing. */
  have?: {
    brand: string;
    model: string;
    year?: number;
    estimatedValue?: number;
  };
  /** The car they want. */
  want?: {
    brand: string;
    model: string;
    yearMin?: number;
    yearMax?: number;
  };
  /** Quick geographic filter. */
  city?: string;
  radiusKm?: number;
}

export interface CarDetail {
  brand: string;
  model: string;
  year: number;
  estimatedValue: number;
  /** Vehicle mileage in km */
  mileage?: number;
  /** Vehicle exterior color */
  color?: string;
  /** Vehicle location (city/state) */
  localization?: string;
  /** FIPE codes for edit pre-fill */
  fipeBrandId?: string;
  fipeModelCode?: string;
  fipeYearCode?: string;
}

export interface DesiredVehicle {
  brand: string;
  model: string;          // modelo geral ex: "Fit" (primeira palavra do nome FIPE)
  version?: string;       // versão específica ex: "CX 1.4 Flex 16V 5p"
  transmission?: string;  // "Automático" | "Manual"
  yearMin?: number;
  yearMax?: number;
  /** Range of mileage in km (optional) */
  mileageMin?: number;
  mileageMax?: number;
  cashAdjustment: number;        // quanto o dono do post paga (+) ou recebe (-)
  cashAdjustmentTolerance: number; // ±tolerância
  /** FIPE codes for edit pre-fill */
  fipeBrandId?: string;
  fipeVersionCode?: string;
  /** Vehicle body type — when set, brand/model/version are ignored in matching */
  vehicleType?: 'SUV' | 'Caminhonete' | 'Hatch' | 'Sedan';
}

export interface DesiredTrade {
  vehicles: DesiredVehicle[];
  /** Maximum distance in km from the vehicle's location (general setting for the post) */
  maxDistance?: number;
}

export interface CarPost {
  id: string;
  userId: string;
  title: string;
  description: string;
  car: CarDetail;
  desiredTrade: DesiredTrade;
  contactInfo: {
    whatsapp?: string;
    email?: string;
  };
  images: string[];
  createdAt: string;
  isActive: boolean;
}

export interface Match {
  id: string;
  postAId: string;
  postBId: string;
  score: number;
  suggestedCashFromA: number; // quanto A paga pra B (negativo = B paga A)
  status: "pending" | "contacted";
  createdAt: string;
}


