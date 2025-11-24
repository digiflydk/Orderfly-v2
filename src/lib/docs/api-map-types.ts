
export interface ApiMapArea {
  id: string;
  label: string;
  actions: string[];
  firestorePaths: string[];
  notes?: string;
}

export interface ApiMapConfig {
  module: string;
  label: string;
  description: string;
  cms: { areas: ApiMapArea[] };
  public: { areas: ApiMapArea[] };
  domainResolver?: Omit<ApiMapArea, 'id'>;
  logging?: {
    audit?: Omit<ApiMapArea, 'id' | 'actions'> & { firestorePath: string; };
    api?: Omit<ApiMapArea, 'id' | 'actions'> & { firestorePath: string; };
  }
}
