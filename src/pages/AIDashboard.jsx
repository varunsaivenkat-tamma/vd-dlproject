import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import axios from "axios";
import { useLocation } from "react-router-dom";
import { auth } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";

export default function AIDashboard() {
  const location = useLocation();

  // State Management
  const [step, setStep] = useState(location?.state?.startStep || 1);
  const [selectedBrand, setSelectedBrand] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [vehicleBrands, setVehicleBrands] = useState({});
  const [image, setImage] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [capturing, setCapturing] = useState(false);
  const videoRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [damagedParts, setDamagedParts] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState("checking");
  const [carDetails, setCarDetails] = useState({
    type: "",
    color: "",
    year: "",
    fuel: "",
  });
  const [user, setUser] = useState(null);
  const [showLoginAlert, setShowLoginAlert] = useState(false);

  // Check authentication status
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // API Configuration
  const API_BASE_URL = "https://vehicle-damage-dl-backend.onrender.com";
  const ENDPOINTS = {
    VEHICLE_BRANDS: `${API_BASE_URL}/vehicle-brands`,
    PREDICT: `${API_BASE_URL}/predict`,
    HEALTH: `${API_BASE_URL}/health`,
    STATIC: `${API_BASE_URL}/static`,
  };

  // Backend health check (runs once)
  useEffect(() => {
    const checkBackendConnection = async () => {
      try {
        await axios.get(ENDPOINTS.HEALTH, { timeout: 5000 });
        setConnectionStatus("connected");
      } catch (error) {
        console.error("Health check failed:", error);
        setConnectionStatus("failed");
      }
    };
    checkBackendConnection();
  }, [ENDPOINTS.HEALTH]);

  // Fetch brands when connection status is known
  useEffect(() => {
    const fetchVehicleBrands = async () => {
      if (connectionStatus === "failed") {
        setVehicleBrands(getFallbackVehicleData());
        return;
      }
      if (connectionStatus !== "connected") return; // still checking

      try {
        const response = await axios.get(ENDPOINTS.VEHICLE_BRANDS, {
          timeout: 8000,
        });
        setVehicleBrands(response.data);
      } catch (error) {
        console.error("Vehicle brands fetch failed:", error);
        setVehicleBrands(getFallbackVehicleData());
      }
    };

    fetchVehicleBrands();
  }, [connectionStatus, ENDPOINTS.VEHICLE_BRANDS]);

  const getFallbackVehicleData = () => ({
    Toyota: ["Fortuner", "Innova", "Glanza", "Camry", "Corolla"],
    Hyundai: ["Creta", "Venue", "i20", "i10", "Verna"],
    Tata: ["Harrier", "Nexon", "Punch", "Safari", "Tiago"],
    Honda: ["City", "Civic", "Amaze", "Accord", "CR-V"],
    Kia: ["Seltos", "Sonet", "Carens", "Carnival"],
    Mahindra: ["XUV500", "Scorpio", "Bolero", "Thar"],
    Ford: ["Ecosport", "Endeavour", "Figo", "Aspire"],
    MarutiSuzuki: ["Swift", "Baleno", "Dzire", "WagonR"],
  });

  // Handle "Try Our AI" button click
  const handleTryOurAI = () => {
    if (!user) {
      setShowLoginAlert(true);
    } else {
      setStep(2);
    }
  };

  // Image Handling
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImage(URL.createObjectURL(file));
    }
  };

  const startCamera = async () => {
    try {
      setCapturing(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      alert("Camera access denied");
    }
  };

  const stopCamera = () => {
    setCapturing(false);
    videoRef.current?.srcObject
      ?.getTracks()
      .forEach((track) => track.stop());
  };

  const capturePhoto = () => {
    const canvas = document.createElement("canvas");
    const video = videoRef.current;
    if (!video?.videoWidth) return alert("Camera not ready");

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return alert("Capture failed");
        const file = new File([blob], "captured.jpg", {
          type: "image/jpeg",
        });
        setImageFile(file);
        setImage(URL.createObjectURL(file));
        stopCamera();
      },
      "image/jpeg",
      0.8
    );
  };

  // Vehicle Form
  const handleCarDetailChange = (field, value) => {
    setCarDetails((prev) => ({ ...prev, [field]: value }));
  };

  // Prediction API
  const handlePredict = async () => {
    if (!imageFile) return alert("Please upload an image");
    if (!selectedBrand || !selectedModel)
      return alert("Please select brand and model");
    if (
      !carDetails.type ||
      !carDetails.color ||
      !carDetails.year ||
      !carDetails.fuel
    ) {
      return alert("Please complete vehicle details");
    }
    if (connectionStatus === "failed")
      return alert("Backend not connected");

    setLoading(true);
    setStep(6);

    try {
      const formData = new FormData();
      formData.append("image", imageFile);
      formData.append("brand", selectedBrand);
      formData.append("model", selectedModel);
      formData.append("type", carDetails.type);
      formData.append("color", carDetails.color);
      formData.append("year", carDetails.year);
      formData.append("fuel", carDetails.fuel);

      const response = await axios.post(ENDPOINTS.PREDICT, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000,
      });

      if (response.data.success) {
        setPrediction(response.data);
        const parts =
          response.data.cost_results?.map((item, idx) => ({
            part: item.damage_type,
            severity_label: item.severity,
            confidence: item.confidence,
            cost: item.cost,
            image: response.data.crops?.[idx] || "",
          })) || [];
        setDamagedParts(parts);
        setStep(7);
      } else {
        alert("Analysis failed");
        setStep(4);
      }
    } catch (error) {
      console.error("Predict error:", error);
      alert("Analysis failed. Check backend connection.");
      setStep(4);
    } finally {
      setLoading(false);
    }
  };

  // Helper Functions
  const totalCost = damagedParts.reduce(
    (sum, p) => sum + (p.cost || 0),
    0
  );

  const printResults = () => {
    const printContent =
      document.getElementById("printable-results")?.innerHTML;
    if (!printContent) return alert("No content to print");

    const printWindow = window.open(
      "",
      "_blank",
      "width=1000,height=800"
    );
    if (!printWindow) return alert("Please allow popups to print");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Damage Analysis Report</title>
          <style>
            body { font-family: Arial; margin: 40px; color: #333; }
            .print-header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
            .summary-cards { display: flex; justify-content: space-around; margin: 30px 0; text-align: center; }
            .summary-card { padding: 20px; border: 1px solid #ddd; border-radius: 10px; min-width: 150px; }
            .damage-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            .damage-table th, .damage-table td { border: 1px solid #ddd; padding: 12px; text-align: left; }
            .damage-table th { background-color: #f8f9fa; }
            .total-cost { text-align: right; font-size: 1.5em; font-weight: bold; margin-top: 30px; color: #059669; }
            @media print { body { margin: 0; } .no-print { display: none; } }
          </style>
        </head>
        <body>
          <div class="print-header">
            <h1>Vehicle Damage Analysis Report</h1>
            <p>Generated on ${new Date().toLocaleDateString()}</p>
          </div>
          ${printContent}
        </body>
      </html>
    `);

    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  const resetFlow = () => {
    setStep(1);
    setSelectedBrand("");
    setSelectedModel("");
    setImage(null);
    setImageFile(null);
    setPrediction(null);
    setDamagedParts([]);
    setCarDetails({ type: "", color: "", year: "", fuel: "" });
  };

  // Brand Logos
  const brandLogos = {
    Toyota:
      "https://logos-world.net/wp-content/uploads/2020/04/Toyota-Symbol.png",
    Hyundai:
      "https://www.pngall.com/wp-content/uploads/13/Hyundai-Logo-PNG-File.png",
    Tata: "https://logolook.net/wp-content/uploads/2023/07/Tata-Emblem.png",
    Honda:
      "https://logos-world.net/wp-content/uploads/2021/03/Honda-Emblem.png",
    Kia: "https://static.wixstatic.com/media/f2bf43_8a25cd1971634bb2926fbc2c366af06e~mv2.png",
    Mahindra:
      "https://car-logos.net/wp-content/uploads/2023/04/mahindra-logo-2021-present-scaled.webp",
    Ford: "https://www.freepnglogos.com/uploads/hd-ford-car-logo-png-31.png",
    MarutiSuzuki:
      "https://www.freepnglogos.com/uploads/suzuki-png-logo/latest-models-world-suzuki-png-logo-0.png",
  };

  // Login Alert Popup Component
  const LoginAlert = () => (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={() => setShowLoginAlert(false)}
    >
      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center">
          <div className="text-5xl mb-4">🔒</div>
          <h3 className="text-2xl font-bold mb-4">Login Required</h3>
          <p className="text-gray-300 mb-6">
            Please login to access our AI-powered vehicle damage detection
            feature.
          </p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => setShowLoginAlert(false)}
              className="px-6 py-3 border border-gray-600 rounded-xl hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={() => (window.location.href = "/login")}
              className="px-6 py-3 bg-purple-600 rounded-xl hover:bg-purple-700"
            >
              Go to Login
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );

  // Step components (unchanged except for using API_BASE_URL etc.)
  const Step1Hero = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-7xl mx-auto"
    >
      {/* ... same as your original Step1Hero ... */}
      {/* Omitted here for brevity; keep your existing JSX */}
    </motion.div>
  );

  const Step2Brands = () => (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      className="max-w-6xl mx-auto"
    >
      {/* ... same JSX as you provided for Step2Brands ... */}
    </motion.div>
  );

  const Step3Models = () => (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      className="max-w-4xl mx-auto"
    >
      {/* ... same JSX as you provided for Step3Models ... */}
    </motion.div>
  );

  const Step4Image = () => (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      className="max-w-6xl mx-auto"
    >
      {/* ... same JSX as you provided for Step4Image ... */}
    </motion.div>
  );

  const Step5Form = () => (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      className="max-w-4xl mx-auto"
    >
      {/* ... same JSX as you provided for Step5Form ... */}
    </motion.div>
  );

  const Step6Loading = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-2xl mx-auto text-center mt-20"
    >
      {/* ... same JSX as you provided for Step6Loading ... */}
    </motion.div>
  );

  const Step7Results = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-7xl mx-auto"
    >
      {/* ... same JSX as you provided for Step7Results, using API_BASE_URL for images ... */}
    </motion.div>
  );

  // Main Render
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white px-4 py-8">
      {step === 1 && <Step1Hero />}
      {step === 2 && <Step2Brands />}
      {step === 3 && <Step3Models />}
      {step === 4 && <Step4Image />}
      {step === 5 && <Step5Form />}
      {step === 6 && <Step6Loading />}
      {step === 7 && <Step7Results />}

      {showLoginAlert && <LoginAlert />}
    </div>
  );
}
