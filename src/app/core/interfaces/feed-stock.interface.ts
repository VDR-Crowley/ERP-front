export interface FeedStock {
  type: string;
  bagsInStock: number;
  kgInStock: number;
  lastBagWeightKg: number;
  expirationDate: string | null;
}

export interface FeedOpenLog {
  feedType: string;
  date: string;
  weightKg: number;
}
