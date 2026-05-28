export interface LinkEntity {
  id?: string;
  trackingId: string;
  userId: string;
  originalUrl: string;
  channel: string;
  tag?: string; // Product tag grouping identifier
  createdAt: any; // Firebase Timestamp or FieldValue
}

export interface ClickEntity {
  id?: string;
  trackingId: string;
  linkOwnerId: string;
  channel: string;
  originalUrl: string;
  deviceType: 'Mobile' | 'PC';
  referrer: string;
  userAgent: string;
  clickedAt: any; // Firebase Timestamp
}
