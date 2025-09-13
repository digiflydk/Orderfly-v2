

type HSLColor = { h: number; s: number; l: number };
type FontSizes = {
  h1: number;
  h2: number;
  h3: number;
  h4: number;
  body: number;
};

export interface Service {
    title: string;
    description: string;
    imageUrl: string;
    aiHint: string;
}

export interface Case {
    title: string;
    description: string;
    imageUrl: string;
    link: string;
    aiHint: string;
}

export interface TeamMember {
    name: string;
    title: string;
    description:string;
    imageUrl: string;
    linkedinUrl: string;
    aiHint: string;
}

export interface NavLink {
    label: string;
    href: string;
}

export interface Customer {
    id: string;
    name: string;
    logoUrl: string;
    aiHint: string;
}

export type SectionPadding = {
    top: number;
    bottom: number;
    topMobile: number;
    bottomMobile: number;
}

export interface SectionVisibility {
    feature?: boolean;
    services?: boolean;
    aiProject?: boolean;
    cases?: boolean;
    about?: boolean;
    customers?: boolean;
    contact?: boolean;
}

export type Alignment = 'left' | 'center' | 'right';

export type HeaderTheme = {
  logoUrl?: string;              // https URL eller gs:// der er resolved
  bgColor?: string;              // fx "#111827"
  linkColor?: string;            // normal tekst/ikon
  linkHoverColor?: string;       // hover tekst/ikon
  iconColor?: string;            // hvis adskilt ønskes
  isSticky?: boolean;
};

export interface FooterColumn {
    title?: string;
    links: NavLink[];
}
export interface SocialLink {
    kind: 'facebook'|'instagram'|'tiktok'|'x'|'youtube'|'linkedin';
    href: string;
}

export type FooterTheme = {
  isVisible?: boolean;         // styrer om footeren vises
  logoUrl?: string;
  bgColor?: string;            // fx "#0B0B0B"
  textColor?: string;          // brødtekst
  linkColor?: string;          // links
  linkHoverColor?: string;     // links hover
  columns?: FooterColumn[];
  socials?: SocialLink[];
  legalText?: string;          // fx copyright / CVR
};

export interface GeneralSettings {
    websiteTitle?: string;
    logoUrl?: string;
    logoAlt?: string;
    faviconUrl?: string;
    companyName?: string;
    streetAddress?: string;
    postalCode?: string;
    city?: string;
    countryCode?: string;
    phoneNumber?: string;
    businessEmail?: string;
    cvr?: string;
    country?: string;
    openingHours?: Record<string, { from: string; to: string; isOpen: boolean }>;
    allowSearchEngineIndexing?: boolean;
    seoTitle?: string;
    metaDescription?: string;
    socialShareImageUrl?: string;
    linkedinUrl?: string;
    facebookUrl?: string;
    instagramUrl?: string;
    twitterUrl?: string;
    tiktokUrl?: string;
    
    // Tracking settings
    enableGtm?: boolean;
    gtmId?: string;
    enableGoogleAnalytics?: boolean;
    googleAnalyticsId?: string;
    enableFacebookPixel?: boolean;
    facebookPixelId?: string;
    enableGoogleAds?: boolean;
    googleAdsId?: string;

    // AI Settings
    aiProvider?: 'googleai' | 'openai';
    aiModel?: string;
    aiGreetingMessage?: string;
    aiSystemPrompt?: string; // Used for Google AI
    aiSystemPromptOpenAI?: string; // Used for OpenAI

    // Design Settings
    themeColors?: {
        primary: HSLColor;
        background: HSLColor;
        accent: HSLColor;
    };
    themeFontSizes?: FontSizes;
    
    // Header Settings
    headerTheme?: HeaderTheme;
    headerNavLinks?: NavLink[];
    headerLogoWidth?: number;
    headerHeight?: number;
    headerInitialBackgroundColor?: HSLColor;
    headerInitialBackgroundOpacity?: number;
    headerScrolledBackgroundColor?: HSLColor;
    headerScrolledBackgroundOpacity?: number;
    headerIsSticky?: boolean;
    headerMenuIconColor?: string;
    headerLinkColor?: string;
    headerLinkHoverColor?: string;
    headerLinkSize?: number;

    // Footer Settings
    footer?: FooterTheme;
    footerTagline?: string;
    footerDescription?: string;
    footerDescriptionColor?: string;
    footerDescriptionSize?: number;
    footerLogoUrl?: string;
    footerLogoAlt?: string;
    footerLogoWidth?: number;
    footerBackgroundColor?: HSLColor;
    footerCompanyNameColor?: string;
    footerCompanyNameSize?: number;
    footerAddressColor?: string;
    footerAddressSize?: number;
    footerContactColor?: string;
    footerContactSize?: number;

    // Home Page Content
    homePageSectionOrder?: string[];

    heroHeadline?: string;
    heroHeadlineColor?: string;
    heroHeadlineSize?: number;
    heroHeadlineSizeMobile?: number;
    heroDescription?: string;
    heroDescriptionColor?: string;
    heroDescriptionSize?: number;
    heroDescriptionSizeMobile?: number;
    heroImageGrid?: { imageUrl: string; alt: string }[];
    heroEnableGradientOverlay?: boolean;
    heroAlignment?: Alignment;
    heroVerticalAlignment?: 'top' | 'center' | 'bottom';
    heroTextMaxWidth?: number;
    heroCtaEnabled?: boolean;
    heroCtaText?: string;
    heroCtaLink?: string;
    heroCtaVariant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | 'pill';
    heroCtaSize?: 'default' | 'sm' | 'lg' | 'icon';
    heroCtaTextSize?: number;
    heroCtaTextSizeMobile?: number;

    featureSectionHeading?: string;
    featureSectionHeadingColor?: string;
    featureSectionHeadingSize?: number;
    featureSectionHeadingSizeMobile?: number;
    featureSectionBody?: string;
    featureSectionBodyColor?: string;
    featureSectionBodySize?: number;
    featureSectionBodySizeMobile?: number;
    featureSectionImageUrl?: string;
    featureSectionAiHint?: string;
    featureSectionCtaText?: string;
    featureSectionCtaLink?: string;
    featureSectionCtaVariant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | 'pill';
    featureSectionCtaSize?: 'default' | 'sm' | 'lg';
    featureSectionCtaTextSize?: number;
    featureSectionCtaTextSizeMobile?: number;
    featureSectionBackgroundColor?: HSLColor;
    featureSectionAlignment?: Alignment;
    
    servicesSectionTitle?: string;
    servicesSectionTitleColor?: string;
    servicesSectionTitleSize?: number;
    servicesSectionDescription?: string;
    servicesSectionDescriptionColor?: string;
    servicesSectionDescriptionSize?: number;
    servicesSectionAlignment?: Alignment;
    servicesSectionBackgroundColor?: HSLColor;
    services?: Service[];
    serviceCardTitleColor?: string;
    serviceCardTitleSize?: number;
    serviceCardDescriptionColor?: string;
    serviceCardDescriptionSize?: number;
    servicesCtaEnabled?: boolean;
    servicesCtaText?: string;
    servicesCtaLink?: string;
    servicesCtaVariant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | 'pill';
    servicesCtaSize?: 'default' | 'sm' | 'lg';
    servicesCtaTextSize?: number;
    servicesCtaTextSizeMobile?: number;

    aiProjectSectionIconText?: string;
    aiProjectSectionTitle?: string;
    aiProjectSectionTitleColor?: string;
    aiProjectSectionTitleSize?: number;
    aiProjectSectionDescription?: string;
    aiProjectSectionDescriptionColor?: string;
    aiProjectSectionDescriptionSize?: number;
    aiProjectSectionBackgroundColor?: HSLColor;
    aiProjectSectionAlignment?: Alignment;

    casesSectionTitle?: string;
    casesSectionTitleColor?: string;
    casesSectionTitleSize?: number;
    casesSectionDescription?: string;
    casesSectionDescriptionColor?: string;
    casesSectionDescriptionSize?: number;
    casesSectionAlignment?: Alignment;
    cases?: Case[];
    
    aboutSectionTitle?: string;
    aboutSectionTitleColor?: string;
    aboutSectionTitleSize?: number;
    aboutText?: string;
    aboutTextColor?: string;
    aboutTextSize?: number;
    aboutSectionAlignment?: Alignment;
    teamMembers?: TeamMember[];
    teamMemberNameColor?: string;
    teamMemberNameSize?: number;
    teamMemberTitleColor?: string;
    teamMemberTitleSize?: number;
    teamMemberDescriptionColor?: string;
    teamMemberDescriptionSize?: number;
    
    customersSectionTitle?: string;
    customersSectionTitleColor?: string;
    customersSectionTitleSize?: number;
    customersSectionDescription?: string;
    customersSectionDescriptionColor?: string;
    customersSectionDescriptionSize?: number;
    customersSectionBackgroundColor?: HSLColor;
    customersSectionAlignment?: Alignment;

    // Spacing
    sectionPadding?: Partial<Record<keyof SectionVisibility | 'contact', SectionPadding>>;
    
    // Section Visibility
    sectionVisibility?: Partial<SectionVisibility>;

    // Customers
    customers?: Customer[];
}
