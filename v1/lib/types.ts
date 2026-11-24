export interface User {
  id: string;
  name: string;
  email: string;
  provider: "google" | "email";
  avatar?: string;
  createdAt: string;
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

export interface Conversation {
  id: string;
  postId: string;
  participantIds: string[];  // exactly 2 user IDs
  matchId?: string;          // set when auto-created from a match
  createdAt: string;
  updatedAt: string;         // bumped on each new message
  /** ISO timestamp of the last time each participant opened the thread. */
  lastReadAt?: Record<string, string>;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  createdAt: string;
}
