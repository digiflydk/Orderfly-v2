
// This file contains hardcoded content for the M3 homepage layout,
// derived from the Figma design export.

export const heroContent = {
  badge: "NYHEDER",
  title: "TRUFFLE & PARMESAN PIZZA",
  description:
    "Sprød, håndlavet bund med cremet trøffelmayo, parmesan, mozzarella og frisk rucola – en perfekt, ægte balance.",
  imageUrl:
    "https://images.unsplash.com/photo-1745145506817-3b76b8788699?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxnb3VybWV0JTIwcGl6emElMjBvdmVyaGVhZHxlbnwxfHx8fDE3NjAxMTg4NzB8MA&ixlib=rb-4.1.0&q=80&w=1920",
  ctaText: "Bestil nu",
};

export const ctaDeckContent = {
  m3point: {
    title: "TJEN POINT, OG FÅ RABAT MED M3POINT",
    description: "Optjen M3Point og få kostbare rabatter, hver gang du bestiller os.",
    imageUrl: "https://images.unsplash.com/photo-1727003826885-4512f0a8388a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwaXp6YSUyMHNsaWNlcyUyMHNoYXJpbmd8ZW58MXx8fHwxNzYwMTE4ODczfDA&ixlib=rb-4.1.0&q=80&w=1080",
    ctaText: "Bliv medlem",
  },
  m3plus: {
    title: "SPAR OP TIL 50% MED M3PLUS",
    description: "Bliv M3PLUS medlem i dag! Start med at vælge mellem vores tre forskellige medlemskaber.",
    imageUrl: "https://images.unsplash.com/photo-1689150911817-3e27168ab6a3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwaXp6YSUyMHdvb2QlMjBmaXJlZHxlbnwxfHx8fDE3NjAxMTg4NzN8MA&ixlib=rb-4.1.0&q=80&w=1080",
    ctaText: "Tilmeld nu",
  }
};

export const menuGridContent = {
  title: "SE VORES MENUKORT",
  description: "Gå på opdagelse i vores store og varierede menukort, som rummer muligheder for alle.",
  ctaText: "Se menukort",
  pizzas: [
    {
      name: "Pepperoni Pizza",
      description: "Klassisk pepperoni med mozzarella og tomatsauce",
      price: 89,
      imageUrl: "https://images.unsplash.com/photo-1759311943662-5ff7fc6ee5c4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwZXBwZXJvbmklMjBwaXp6YSUyMGZyZXNofGVufDF8fHx8MTc2MDExODg3MXww&ixlib=rb-4.1.0&q=80&w=800",
    },
    {
      name: "Kebab Pizza",
      description: "Saftig kebab med løg, salat og dressing",
      price: 99,
      imageUrl: "https://images.unsplash.com/photo-1745145506817-3b76b8788699?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxnb3VybWV0JTIwcGl6emElMjBvdmVyaGVhZHxlbnwxfHx8fDE3NjAxMTg4NzB8MA&ixlib=rb-4.1.0&q=80&w=800",
    },
    {
      name: "Margherita Pizza",
      description: "Simpel og klassisk med mozzarella og basilikum",
      price: 79,
      imageUrl: "https://images.unsplash.com/photo-1667207394004-acb6aaf4790e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtYXJnaGVyaXRhJTIwcGl6emElMjBjbG9zZXxlbnwxfHx8fDE3NjAwODg3MDl8MA&ixlib=rb-4.1.0&q=80&w=800",
    },
    {
      name: "Vesuvio Pizza",
      description: "Skinke og mozzarella – en italiensk klassiker",
      price: 85,
      imageUrl: "https://images.unsplash.com/photo-1717250180588-8737e18314d3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx2ZWdldGFyaWFuJTIwcGl6emElMjBjb2xvcmZ1bHxlbnwxfHx8fDE3NjAxMTg4NzJ8MA&ixlib=rb-4.1.0&q=80&w=800",
    },
    {
      name: "Hawaii Pizza",
      description: "Ananas og skinke på crispy bund",
      price: 89,
      imageUrl: "https://images.unsplash.com/photo-1689150911817-3e27168ab6a3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwaXp6YSUyMHdvb2QlMjBmaXJlZHxlbnwxfHx8fDE3NjAxMTg4NzN8MA&ixlib=rb-4.1.0&q=80&w=800",
    },
    {
      name: "Quattro Stagioni",
      description: "Fire årstider med skinke, champignon, artiskok og oliven",
      price: 95,
      imageUrl: "https://images.unsplash.com/photo-1610913948701-42071d6a1df5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhcnRpc2FuJTIwcGl6emElMjBtYWtpbmd8ZW58MXx8fHwxNzYwMTE4ODczfDA&ixlib=rb-4.1.0&q=80&w=800",
    },
  ]
};

export const promoBannerContent = {
  title: "LAD BØRNENE BESTEMME",
  description: "Vi har sagt farvel til legetøjet i børnemenuen. I stedet planter vi træer, når der købes børnemenu.",
  ctaText: "Læs mere",
  imageUrl: "https://images.unsplash.com/photo-1754799565126-fe1ad148db85?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwaXp6YSUyMGluZ3JlZGllbnRzJTIwZnJlc2h8ZW58MXx8fHwxNzYwMTE4ODcyfDA&ixlib=rb-4.1.0&q=80&w=1920",
};

export const footerCTAContent = {
    title: "FÅ LEVERET VARM OG FRISK PIZZA LIGE TIL DØREN",
    ctaText: "Bestil med M3ToGo"
};
