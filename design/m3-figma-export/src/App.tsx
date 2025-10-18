import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { ImageWithFallback } from "./components/figma/ImageWithFallback";
import { VideoWithFallback } from "./components/figma/VideoWithFallback";
import { OrderModal } from "./components/OrderModal";
import { MenuPage } from "./components/MenuPage";
import { Button } from "./components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function App() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [currentPizzaSet, setCurrentPizzaSet] = useState(0);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState<
    "landing" | "menu"
  >("landing");
  const [deliveryMethod, setDeliveryMethod] = useState<
    "takeaway" | "delivery"
  >("takeaway");

  const heroSlides = [
    {
      badge: "NYHEDER",
      title: "TRUFFLE & PARMESAN PIZZA",
      description:
        "Sprød, håndlavet bund med cremet trøffelmayo, parmesan, mozzarella og frisk rucola – en perfekt, ægte balance.",
      imageUrl:
        "https://images.unsplash.com/photo-1745145506817-3b76b8788699?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxnb3VybWV0JTIwcGl6emElMjBvdmVyaGVhZHxlbnwxfHx8fDE3NjAxMTg4NzB8MA&ixlib=rb-4.1.0&q=80&w=1080",
    },
    {
      badge: "POPULÆR",
      title: "PEPPERONI DELUXE",
      description:
        "Klassisk italiensk pizza med dobbelt pepperoni, mozzarella og vores signatur tomatsauce.",
      imageUrl:
        "https://images.unsplash.com/photo-1759311943662-5ff7fc6ee5c4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwZXBwZXJvbmklMjBwaXp6YSUyMGZyZXNofGVufDF8fHx8MTc2MDExODg3MXww&ixlib=rb-4.1.0&q=80&w=1080",
    },
  ];

  // 9 pizza types for rotation (use videoUrl for mp4, imageUrl as fallback)
  const allPizzas = [
    {
      name: "Pepperoni Pizza",
      description:
        "Klassisk pepperoni med mozzarella og tomatsauce",
      price: 89,
      streamableId: "4antvr", // Streamable video ID
      isStreamable: true,
      imageUrl:
        "https://images.unsplash.com/photo-1759311943662-5ff7fc6ee5c4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwZXBwZXJvbmklMjBwaXp6YSUyMGZyZXNofGVufDF8fHx8MTc2MDExODg3MXww&ixlib=rb-4.1.0&q=80&w=1080",
      useVideo: true, // Set to false to use image instead
    },
    {
      name: "Kebab Pizza",
      description: "Saftig kebab med løg, salat og dressing",
      price: 99,
      videoUrl:
        "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
      imageUrl:
        "https://images.unsplash.com/photo-1745145506817-3b76b8788699?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxnb3VybWV0JTIwcGl6emElMjBvdmVyaGVhZHxlbnwxfHx8fDE3NjAxMTg4NzB8MA&ixlib=rb-4.1.0&q=80&w=1080",
      useVideo: true,
    },
    {
      name: "Margherita Pizza",
      description:
        "Simpel og klassisk med mozzarella og basilikum",
      price: 79,
      videoUrl:
        "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
      imageUrl:
        "https://images.unsplash.com/photo-1667207394004-acb6aaf4790e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtYXJnaGVyaXRhJTIwcGl6emElMjBjbG9zZXxlbnwxfHx8fDE3NjAwODg3MDl8MA&ixlib=rb-4.1.0&q=80&w=1080",
      useVideo: true,
    },
    {
      name: "Vesuvio Pizza",
      description:
        "Skinke og mozzarella – en italiensk klassiker",
      price: 85,
      videoUrl:
        "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
      imageUrl:
        "https://images.unsplash.com/photo-1717250180588-8737e18314d3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx2ZWdldGFyaWFuJTIwcGl6emElMjBjb2xvcmZ1bHxlbnwxfHx8fDE3NjAxMTg4NzJ8MA&ixlib=rb-4.1.0&q=80&w=1080",
      useVideo: true,
    },
    {
      name: "Hawaii Pizza",
      description: "Ananas og skinke på crispy bund",
      price: 89,
      videoUrl:
        "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
      imageUrl:
        "https://images.unsplash.com/photo-1689150911817-3e27168ab6a3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwaXp6YSUyMHdvb2QlMjBmaXJlZHxlbnwxfHx8fDE3NjAxMTg4NzN8MA&ixlib=rb-4.1.0&q=80&w=1080",
      useVideo: true,
    },
    {
      name: "Quattro Stagioni",
      description:
        "Fire årstider med skinke, champignon, artiskok og oliven",
      price: 95,
      videoUrl:
        "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
      imageUrl:
        "https://images.unsplash.com/photo-1610913948701-42071d6a1df5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhcnRpc2FuJTIwcGl6emElMjBtYWtpbmd8ZW58MXx8fHwxNzYwMTE4ODczfDA&ixlib=rb-4.1.0&q=80&w=1080",
      useVideo: true,
    },
    {
      name: "Vegetariana",
      description:
        "Friske grøntsager med paprika, løg og champignon",
      price: 85,
      videoUrl:
        "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
      imageUrl:
        "https://images.unsplash.com/photo-1754799565126-fe1ad148db85?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwaXp6YSUyMGluZ3JlZGllbnRzJTIwZnJlc2h8ZW58MXx8fHwxNzYwMTE4ODcyfDA&ixlib=rb-4.1.0&q=80&w=1080",
      useVideo: true,
    },
    {
      name: "Mexicana",
      description:
        "Stærk pizza med jalapeños, kødsauce og tacokrydderi",
      price: 92,
      videoUrl:
        "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
      imageUrl:
        "https://images.unsplash.com/photo-1727003826885-4512f0a8388a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwaXp6YSUyMHNsaWNlcyUyMHNoYXJpbmd8ZW58MXx8fHwxNzYwMTE4ODczfDA&ixlib=rb-4.1.0&q=80&w=1080",
      useVideo: true,
    },
    {
      name: "Capricciosa",
      description: "Skinke, champignon og artiskok",
      price: 89,
      videoUrl:
        "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
      imageUrl:
        "https://images.unsplash.com/photo-1678443249148-9ecc13b14108?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwaXp6YSUyMGRlbGl2ZXJ5JTIwYm94fGVufDF8fHx8MTc2MDEwODkyNXww&ixlib=rb-4.1.0&q=80&w=1080",
      useVideo: true,
    },
  ];

  // Auto-rotate hero banner every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Auto-rotate pizza cards every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentPizzaSet((prev) => (prev + 1) % 3);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
  };

  const prevSlide = () => {
    setCurrentSlide(
      (prev) =>
        (prev - 1 + heroSlides.length) % heroSlides.length,
    );
  };

  const nextPizzaSet = () => {
    setCurrentPizzaSet((prev) => (prev + 1) % 3);
  };

  const prevPizzaSet = () => {
    setCurrentPizzaSet((prev) => (prev - 1 + 3) % 3);
  };

  // Get current 3 pizzas to display based on rotation
  const getCurrentPizzas = () => {
    const startIndex = currentPizzaSet * 3;
    return allPizzas.slice(startIndex, startIndex + 3);
  };

  const handleDeliveryMethodSelected = (
    method: "takeaway" | "delivery",
  ) => {
    setDeliveryMethod(method);
    setCurrentPage("menu");
    setOrderModalOpen(false);
  };

  const handleBackToLanding = () => {
    setCurrentPage("landing");
  };

  const handleNavigateToMenu = () => {
    setOrderModalOpen(true);
  };

  // Show Menu Page
  if (currentPage === "menu") {
    return (
      <MenuPage
        deliveryMethod={deliveryMethod}
        onBack={handleBackToLanding}
      />
    );
  }

  // Show Landing Page
  return (
    <div className="min-h-screen bg-background">
      <Header onNavigateToMenu={handleNavigateToMenu} />

      {/* Hero Banner - Sunset Style */}
      <section className="mx-auto max-w-[1280px] px-10 pt-[25px] pb-[12px]">
        <div
          className="relative h-[420px] overflow-hidden"
          style={{
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.06)",
          }}
        >
          <AnimatePresence initial={false}>
            <motion.div
              key={currentSlide}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{
                duration: 0.7,
                ease: [0.43, 0.13, 0.23, 0.96],
              }}
              className="absolute inset-0"
            >
              <ImageWithFallback
                src={heroSlides[currentSlide].imageUrl}
                alt={heroSlides[currentSlide].title}
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-transparent" />

              <div className="relative h-full flex items-center px-12">
                <div className="max-w-[600px]">
                  <div
                    className="inline-block bg-secondary text-secondary-foreground px-4 py-2 rounded text-[12px] mb-6 uppercase tracking-wider"
                    style={{ fontWeight: 700 }}
                  >
                    {heroSlides[currentSlide].badge}
                  </div>
                  <h1
                    className="text-white text-[64px] leading-[1.1] mb-6 uppercase"
                    style={{ fontWeight: 700 }}
                  >
                    {heroSlides[currentSlide].title}
                  </h1>
                  <p className="text-white/90 text-[18px] mb-8 leading-relaxed">
                    {heroSlides[currentSlide].description}
                  </p>
                  <Button
                    onClick={() => setOrderModalOpen(true)}
                    className="bg-secondary hover:bg-secondary/90 text-[#2D2D2D] rounded-md px-10 py-6 text-[14px] uppercase tracking-wide"
                    style={{ fontWeight: 700 }}
                  >
                    Bestil nu
                  </Button>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Carousel Controls */}
          <button
            onClick={prevSlide}
            className="absolute left-6 top-1/2 -translate-y-1/2 z-20 bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white rounded-full p-3 transition-all"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            onClick={nextSlide}
            className="absolute right-6 top-1/2 -translate-y-1/2 z-20 bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white rounded-full p-3 transition-all"
          >
            <ChevronRight className="h-6 w-6" />
          </button>

          {/* Slide Indicators */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2 z-20">
            {heroSlides.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentSlide(index)}
                className={`w-2 h-2 rounded-full transition-all ${
                  index === currentSlide
                    ? "bg-secondary w-8"
                    : "bg-white/50"
                }`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Feature Cards Row */}
      <section className="mx-auto max-w-[1280px] px-10 py-[12px]">
        <div className="grid grid-cols-2 gap-6">
          {/* M3Point Card */}
          <div
            className="relative h-[340px] overflow-hidden group cursor-pointer"
            style={{
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.06)",
            }}
          >
            <ImageWithFallback
              src="https://images.unsplash.com/photo-1727003826885-4512f0a8388a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwaXp6YSUyMHNsaWNlcyUyMHNoYXJpbmd8ZW58MXx8fHwxNzYwMTE4ODczfDA&ixlib=rb-4.1.0&q=80&w=1080"
              alt="M3 Point"
              className="absolute inset-0 w-full h-full object-cover brightness-75 group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
            <div className="absolute bottom-0 left-0 p-8">
              <div className="mb-2">
                <span
                  className="text-secondary text-[14px] uppercase tracking-wide"
                  style={{ fontWeight: 700 }}
                >
                  M3
                </span>
                <span
                  className="text-primary text-[14px] uppercase tracking-wide"
                  style={{ fontWeight: 700 }}
                >
                  POINT
                </span>
              </div>
              <h3
                className="text-white text-[28px] mb-3 uppercase leading-tight"
                style={{ fontWeight: 700 }}
              >
                TJEN POINT, OG FÅ RABAT MED M3POINT
              </h3>
              <p className="text-white/80 text-[14px] mb-4 max-w-[400px]">
                Optjen M3Point og få kostbare rabatter, hver
                gang du bestiller os.
              </p>
              <Button
                className="bg-secondary hover:bg-secondary/90 text-[#2D2D2D] rounded-md px-8 py-3 text-[12px] uppercase tracking-wide"
                style={{ fontWeight: 700 }}
              >
                Bliv medlem
              </Button>
            </div>
          </div>

          {/* M3Plus Card */}
          <div
            className="relative h-[340px] overflow-hidden group cursor-pointer"
            style={{
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.06)",
            }}
          >
            <ImageWithFallback
              src="https://images.unsplash.com/photo-1689150911817-3e27168ab6a3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwaXp6YSUyMHdvb2QlMjBmaXJlZHxlbnwxfHx8fDE3NjAxMTg4NzN8MA&ixlib=rb-4.1.0&q=80&w=1080"
              alt="M3 Plus"
              className="absolute inset-0 w-full h-full object-cover brightness-75 group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
            <div className="absolute bottom-0 left-0 p-8">
              <div className="mb-2">
                <span
                  className="text-secondary text-[14px] uppercase tracking-wide"
                  style={{ fontWeight: 700 }}
                >
                  M3
                </span>
                <span
                  className="text-primary text-[14px] uppercase tracking-wide"
                  style={{ fontWeight: 700 }}
                >
                  PLUS
                </span>
              </div>
              <h3
                className="text-white text-[28px] mb-3 uppercase leading-tight"
                style={{ fontWeight: 700 }}
              >
                SPAR OP TIL 50% MED M3PLUS
              </h3>
              <p className="text-white/80 text-[14px] mb-4 max-w-[400px]">
                Bliv M3PLUS medlem i dag! Start med at vælge
                mellem vores tre forskellige medlemskaber.
              </p>
              <Button
                className="bg-secondary hover:bg-secondary/90 text-[#2D2D2D] rounded-md px-8 py-3 text-[12px] uppercase tracking-wide"
                style={{ fontWeight: 700 }}
              >
                Tilmeld nu
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Sections Grid */}
      <section className="mx-auto max-w-[1280px] px-10 py-[12px]">
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* M3ToGo */}
          <div
            className="relative h-[380px] overflow-hidden group cursor-pointer"
            style={{
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.06)",
            }}
          >
            <ImageWithFallback
              src="https://images.unsplash.com/photo-1678443249148-9ecc13b14108?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwaXp6YSUyMGRlbGl2ZXJ5JTIwYm94fGVufDF8fHx8MTc2MDEwODkyNXww&ixlib=rb-4.1.0&q=80&w=1080"
              alt="M3 To Go"
              className="absolute inset-0 w-full h-full object-cover brightness-[0.65] group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
            <div className="absolute bottom-0 left-0 p-8">
              <h3
                className="text-white text-[32px] mb-3 uppercase leading-tight"
                style={{ fontWeight: 700 }}
              >
                M3TOGO
              </h3>
              <p className="text-white/80 text-[14px] mb-4 max-w-[380px]">
                Bestil online og få leveret til din adresse.
                Let, nemt og altid varm når du tager første bid!
              </p>
              <Button
                className="bg-secondary hover:bg-secondary/90 text-[#2D2D2D] rounded-md px-8 py-3 text-[12px] uppercase tracking-wide"
                style={{ fontWeight: 700 }}
              >
                Bestil med M3ToGo
              </Button>
            </div>
          </div>

          {/* Se Vores Menukort */}
          <div
            className="relative h-[380px] overflow-hidden group cursor-pointer"
            style={{
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.06)",
            }}
          >
            <ImageWithFallback
              src="https://images.unsplash.com/photo-1667207394004-acb6aaf4790e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtYXJnaGVyaXRhJTIwcGl6emElMjBjbG9zZXxlbnwxfHx8fDE3NjAwODg3MDl8MA&ixlib=rb-4.1.0&q=80&w=1080"
              alt="Menu"
              className="absolute inset-0 w-full h-full object-cover brightness-[0.65] group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
            <div className="absolute bottom-0 left-0 p-8">
              <h3
                className="text-white text-[32px] mb-3 uppercase leading-tight"
                style={{ fontWeight: 700 }}
              >
                SE VORES MENUKORT
              </h3>
              <p className="text-white/80 text-[14px] mb-4 max-w-[380px]">
                Gå på opdagelse i voresstore og varierede
                menukort, som rummer muligheder for alle.
              </p>
              <Button
                className="bg-secondary hover:bg-secondary/90 text-[#2D2D2D] rounded-md px-8 py-3 text-[12px] uppercase tracking-wide"
                style={{ fontWeight: 700 }}
              >
                Se menukort
              </Button>
            </div>
          </div>
        </div>

        {/* Full Width Banner */}
        <div
          className="relative h-[380px] overflow-hidden group cursor-pointer mb-6"
          style={{
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.06)",
          }}
        >
          <ImageWithFallback
            src="https://images.unsplash.com/photo-1754799565126-fe1ad148db85?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwaXp6YSUyMGluZ3JlZGllbnRzJTIwZnJlc2h8ZW58MXx8fHwxNzYwMTE4ODcyfDA&ixlib=rb-4.1.0&q=80&w=1080"
            alt="Lad børnene bestemme"
            className="absolute inset-0 w-full h-full object-cover brightness-90 group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" />
          <div className="absolute left-0 top-1/2 -translate-y-1/2 p-12">
            <h3
              className="text-white text-[42px] mb-4 uppercase leading-tight max-w-[480px]"
              style={{ fontWeight: 700 }}
            >
              LAD BØRNENE BESTEMME
            </h3>
            <p className="text-white/90 text-[15px] mb-6 max-w-[460px] leading-relaxed">
              Vi har sagt farvel til legetøjet i børnemenuen. I
              stedet planter vi træer, når der købes børnemenu.
            </p>
            <Button
              className="bg-secondary hover:bg-secondary/90 text-[#2D2D2D] rounded-md px-8 py-3 text-[12px] uppercase tracking-wide"
              style={{ fontWeight: 700 }}
            >
              Læs mere
            </Button>
          </div>
        </div>

        {/* Bottom Three Pizza Menu Cards - Rotating */}
        <div className="relative h-[380px] overflow-hidden">
          <AnimatePresence initial={false}>
            <motion.div
              key={currentPizzaSet}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{
                duration: 0.7,
                ease: [0.43, 0.13, 0.23, 0.96],
              }}
              className="absolute inset-0 grid grid-cols-3 gap-6"
            >
              {getCurrentPizzas().map((pizza, index) => (
                <div
                  key={index}
                  className="relative h-[380px] overflow-hidden group cursor-pointer"
                  style={{
                    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.06)",
                  }}
                >
                  {pizza.useVideo ? (
                    <VideoWithFallback
                      src={pizza.videoUrl || ""}
                      streamableId={pizza.streamableId}
                      isStreamable={pizza.isStreamable}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <ImageWithFallback
                      src={pizza.imageUrl}
                      alt={pizza.name}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  )}
                  <div className="absolute bottom-0 left-0 p-6 w-full bg-gradient-to-t from-black/90 via-black/70 to-transparent">
                    <h3
                      className="text-white text-[28px] mb-2 uppercase leading-tight"
                      style={{ fontWeight: 700 }}
                    >
                      {pizza.name}
                    </h3>
                    <p className="text-white/90 text-[14px] mb-4">
                      {pizza.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <span
                        className="text-white text-[24px]"
                        style={{ fontWeight: 700 }}
                      >
                        {pizza.price} kr
                      </span>
                      <Button
                        onClick={() => setOrderModalOpen(true)}
                        className="bg-secondary hover:bg-secondary/90 text-[#2D2D2D] rounded-md px-6 py-2 text-[12px] uppercase tracking-wide"
                        style={{ fontWeight: 700 }}
                      >
                        Bestil
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </motion.div>
          </AnimatePresence>

          {/* Navigation Arrows */}
          <button
            onClick={prevPizzaSet}
            className="absolute left-6 top-1/2 -translate-y-1/2 z-20 bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white rounded-full p-3 transition-all"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            onClick={nextPizzaSet}
            className="absolute right-6 top-1/2 -translate-y-1/2 z-20 bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white rounded-full p-3 transition-all"
          >
            <ChevronRight className="h-6 w-6" />
          </button>

          {/* Dots Indicators */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2 z-20">
            {[0, 1, 2].map((index) => (
              <button
                key={index}
                onClick={() => setCurrentPizzaSet(index)}
                className={`w-2 h-2 rounded-full transition-all ${
                  index === currentPizzaSet
                    ? "bg-secondary w-8"
                    : "bg-white/50"
                }`}
              />
            ))}
          </div>
        </div>
      </section>

      <Footer />

      {/* Order Modal */}
      <OrderModal
        open={orderModalOpen}
        onOpenChange={setOrderModalOpen}
        onDeliveryMethodSelected={handleDeliveryMethodSelected}
      />
    </div>
  );
}