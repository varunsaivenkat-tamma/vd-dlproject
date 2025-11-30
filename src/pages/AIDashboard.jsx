import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import axios from "axios";
import { useLocation } from "react-router-dom";
import { auth } from "../../firebase"; // Adjust path as needed
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
  const [carDetails, setCarDetails] = useState({ type: "", color: "", year: "", fuel: "" });
  const [user, setUser] = useState(null); // Track user authentication
  const [showLoginAlert, setShowLoginAlert] = useState(false); // Popup state

  // Check authentication status
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // API Configuration
  const API_BASE_URL = "http://127.0.0.1:5000";
  const ENDPOINTS = {
    VEHICLE_BRANDS: `${API_BASE_URL}/vehicle-brands`,
    PREDICT: `${API_BASE_URL}/predict`,
    HEALTH: `${API_BASE_URL}/health`,
    STATIC: `${API_BASE_URL}/static`
  };

  // Backend Connection
  useEffect(() => {
    checkBackendConnection();
    fetchVehicleBrands();
  }, []);

  const checkBackendConnection = async () => {
    try {
      const response = await axios.get(ENDPOINTS.HEALTH, { timeout: 5000 });
      setConnectionStatus("connected");
    } catch (error) {
      setConnectionStatus("failed");
    }
  };

  const fetchVehicleBrands = async () => {
    if (connectionStatus === "failed") {
      setVehicleBrands(getFallbackVehicleData());
      return;
    }

    try {
      const response = await axios.get(ENDPOINTS.VEHICLE_BRANDS, { timeout: 8000 });
      setVehicleBrands(response.data);
    } catch (error) {
      setVehicleBrands(getFallbackVehicleData());
    }
  };

  const getFallbackVehicleData = () => ({
    "Toyota": ["Fortuner", "Innova", "Glanza", "Camry", "Corolla"],
    "Hyundai": ["Creta", "Venue", "i20", "i10", "Verna"],
    "Tata": ["Harrier", "Nexon", "Punch", "Safari", "Tiago"],
    "Honda": ["City", "Civic", "Amaze", "Accord", "CR-V"],
    "Kia": ["Seltos", "Sonet", "Carens", "Carnival"],
    "Mahindra": ["XUV500", "Scorpio", "Bolero", "Thar"],
    "Ford": ["Ecosport", "Endeavour", "Figo", "Aspire"],
    "MarutiSuzuki": ["Swift", "Baleno", "Dzire", "WagonR"]
  });

  // Handle "Try Our AI" button click
  const handleTryOurAI = () => {
    if (!user) {
      // Show popup instead of redirecting
      setShowLoginAlert(true);
    } else {
      // Proceed to step 2 if logged in
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
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      alert("Camera access denied");
    }
  };

  const stopCamera = () => {
    setCapturing(false);
    videoRef.current?.srcObject?.getTracks().forEach(track => track.stop());
  };

  const capturePhoto = () => {
    const canvas = document.createElement("canvas");
    const video = videoRef.current;
    if (!video?.videoWidth) return alert("Camera not ready");
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    
    canvas.toBlob((blob) => {
      if (!blob) return alert("Capture failed");
      const file = new File([blob], "captured.jpg", { type: "image/jpeg" });
      setImageFile(file);
      setImage(URL.createObjectURL(file));
      stopCamera();
    }, "image/jpeg", 0.8);
  };

  // Vehicle Form
  const handleCarDetailChange = (field, value) => {
    setCarDetails(prev => ({ ...prev, [field]: value }));
  };

  // Prediction API
  const handlePredict = async () => {
    if (!imageFile) return alert("Please upload an image");
    if (!selectedBrand || !selectedModel) return alert("Please select brand and model");
    if (!carDetails.type || !carDetails.color || !carDetails.year || !carDetails.fuel) {
      return alert("Please complete vehicle details");
    }
    if (connectionStatus === "failed") return alert("Backend not connected");

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
        const parts = response.data.cost_results?.map((item, idx) => ({
          part: item.damage_type,
          severity_label: item.severity,
          confidence: item.confidence,
          cost: item.cost,
          image: response.data.crops?.[idx] || ""
        })) || [];
        setDamagedParts(parts);
        setStep(7);
      } else {
        alert("Analysis failed");
        setStep(4);
      }
    } catch (error) {
      alert("Analysis failed. Check backend connection.");
      setStep(4);
    } finally {
      setLoading(false);
    }
  };

  // Helper Functions
  const totalCost = damagedParts.reduce((sum, p) => sum + (p.cost || 0), 0);

  const printResults = () => {
    const printContent = document.getElementById("printable-results")?.innerHTML;
    if (!printContent) return alert("No content to print");
    
    const printWindow = window.open('', '_blank', 'width=1000,height=800');
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
    "Toyota": "https://logos-world.net/wp-content/uploads/2020/04/Toyota-Symbol.png",
    "Hyundai": "https://www.pngall.com/wp-content/uploads/13/Hyundai-Logo-PNG-File.png",
    "Tata": "https://logolook.net/wp-content/uploads/2023/07/Tata-Emblem.png",
    "Honda": "https://logos-world.net/wp-content/uploads/2021/03/Honda-Emblem.png",
    "Kia": "https://static.wixstatic.com/media/f2bf43_8a25cd1971634bb2926fbc2c366af06e~mv2.png",
    "Mahindra": "https://car-logos.net/wp-content/uploads/2023/04/mahindra-logo-2021-present-scaled.webp",
    "Ford": "https://www.freepnglogos.com/uploads/hd-ford-car-logo-png-31.png",
    "MarutiSuzuki": "https://www.freepnglogos.com/uploads/suzuki-png-logo/latest-models-world-suzuki-png-logo-0.png",
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
            Please login to access our AI-powered vehicle damage detection feature.
          </p>
          <div className="flex gap-4 justify-center">
            <button 
              onClick={() => setShowLoginAlert(false)}
              className="px-6 py-3 border border-gray-600 rounded-xl hover:bg-gray-700"
            >
              Cancel
            </button>
            <button 
              onClick={() => window.location.href = '/login'}
              className="px-6 py-3 bg-purple-600 rounded-xl hover:bg-purple-700"
            >
              Go to Login
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );

  // Step Components
  const Step1Hero = () => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-7xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-16">
        <motion.div initial={{ x: -50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.8 }}>
          <motion.h1 initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} 
            className="text-5xl md:text-6xl font-bold mb-6">
            AI-Powered <span className="text-purple-400">Vehicle Damage</span> Detection
          </motion.h1>
          <motion.p initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }}
            className="text-xl text-gray-300 mb-8">
            Upload a photo of your damaged vehicle and get instant AI-powered damage analysis with accurate repair cost estimates.
          </motion.p>
          <motion.button initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.6 }}
            onClick={handleTryOurAI} className="bg-gradient-to-r from-purple-600 to-blue-600 px-12 py-6 rounded-2xl text-xl font-bold hover:from-purple-700 hover:to-blue-700 transition-all transform hover:scale-105 shadow-2xl">
            🚀 TRY OUR AI - GET STARTED
          </motion.button>
        </motion.div>
        <motion.div initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.3 }}
          className="bg-gray-800 rounded-2xl p-4 shadow-2xl">
          <div className="aspect-video bg-black rounded-xl overflow-hidden">
            <img src="https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExZms2OGx1bzNsdzM3MmV3NnluaXMxemxicHlhZ2VodmxsdWtvdjRzOCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/MgQDiH1UjsW25PFiyb/giphy.gif" 
              alt="Car Damage Analysis" className="w-full h-full object-cover" />
          </div>
        </motion.div>
      </div>

      <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.8 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
        {[
          { icon: "🤖", title: "Advanced AI", desc: "Computer vision for precise damage detection", color: "purple" },
          { icon: "⚡", title: "Instant Results", desc: "Comprehensive analysis within seconds", color: "blue" },
          { icon: "💰", title: "Cost Estimation", desc: "Detailed repair costs in Indian Rupees", color: "green" }
        ].map((feature, idx) => (
          <motion.div key={idx} whileHover={{ scale: 1.05 }} 
            className={`bg-gray-800 rounded-2xl p-6 border-l-4 border-${feature.color}-500`}>
            <div className="text-3xl mb-4">{feature.icon}</div>
            <h3 className="text-2xl font-bold mb-3">{feature.title}</h3>
            <p className="text-gray-300">{feature.desc}</p>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );

  // ... (All other Step components remain exactly the same as before)
  const Step2Brands = () => (
    <motion.div initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} className="max-w-6xl mx-auto">
      <h2 className="text-4xl font-bold mb-8 text-center">Select Vehicle Brand</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
        {Object.keys(vehicleBrands).map(brand => (
          <motion.button key={brand} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={() => { setSelectedBrand(brand); setSelectedModel(""); }}
            className={`p-6 rounded-2xl border-2 transition-all ${selectedBrand === brand ? "border-purple-500 bg-purple-500/20" : "border-gray-600 bg-gray-800"}`}>
            <img src={brandLogos[brand]} alt={brand} className="w-16 h-16 mx-auto mb-3 object-contain" />
            <span className="font-semibold">{brand}</span>
          </motion.button>
        ))}
      </div>
      <div className="flex justify-between mt-12">
        <button onClick={() => setStep(1)} className="px-6 py-3 border border-gray-600 rounded-xl hover:bg-gray-800">← Back</button>
        <button disabled={!selectedBrand} onClick={() => setStep(3)} 
          className="px-6 py-3 bg-purple-600 rounded-xl hover:bg-purple-700 disabled:opacity-50">Next →</button>
      </div>
    </motion.div>
  );

  const Step3Models = () => (
    <motion.div initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} className="max-w-4xl mx-auto">
      <h2 className="text-4xl font-bold mb-2 text-center">Select {selectedBrand} Model</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {vehicleBrands[selectedBrand]?.map(model => (
          <motion.button key={model} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setSelectedModel(model)}
            className={`p-4 rounded-xl border-2 text-left ${selectedModel === model ? "border-purple-500 bg-purple-500/20" : "border-gray-600 bg-gray-800"}`}>
            <div className="flex justify-between items-center">
              <span className="font-semibold">{model}</span>
              {selectedModel === model && <span className="text-purple-400 text-xl">✓</span>}
            </div>
          </motion.button>
        ))}
      </div>
      <div className="flex justify-between">
        <button onClick={() => setStep(2)} className="px-6 py-3 border border-gray-600 rounded-xl hover:bg-gray-800">← Back</button>
        <button disabled={!selectedModel} onClick={() => setStep(4)} 
          className="px-6 py-3 bg-purple-600 rounded-xl hover:bg-purple-700 disabled:opacity-50">Next →</button>
      </div>
    </motion.div>
  );

  const Step4Image = () => (
    <motion.div initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} className="max-w-6xl mx-auto">
      <h2 className="text-4xl font-bold mb-2 text-center">Capture Damage Image</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-gray-800 p-6 rounded-2xl">
          <h3 className="text-xl font-semibold mb-4">Choose Method</h3>
          <div className="mb-6">
            <label className="block text-lg mb-3">📁 Upload from Device</label>
            <div className="border-2 border-dashed border-gray-600 rounded-xl p-8 text-center cursor-pointer">
              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="file-upload" />
              <label htmlFor="file-upload" className="cursor-pointer block">
                <div className="text-4xl mb-3">📸</div>
                <p className="text-gray-300 mb-2">Click to select image</p>
              </label>
            </div>
          </div>
          <div>
            <label className="block text-lg mb-3">📷 Capture with Camera</label>
            {!capturing ? (
              <button onClick={startCamera} className="w-full py-6 border-2 border-dashed border-gray-600 rounded-xl flex flex-col items-center gap-3">
                <span className="text-3xl">📷</span>
                <span className="font-semibold">Start Camera</span>
              </button>
            ) : (
              <div className="space-y-4">
                <div className="bg-black rounded-xl overflow-hidden">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-64 object-cover" />
                </div>
                <div className="flex gap-3">
                  <button onClick={capturePhoto} className="flex-1 py-3 bg-red-500 rounded-xl flex items-center justify-center gap-2">📸 Capture</button>
                  <button onClick={stopCamera} className="flex-1 py-3 border border-gray-600 rounded-xl">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="bg-gray-800 p-6 rounded-2xl">
          <h3 className="text-xl font-semibold mb-4">Image Preview</h3>
          {image ? (
            <div className="space-y-4">
              <img src={image} alt="Preview" className="w-full h-80 object-contain rounded-xl bg-black" />
              <button onClick={() => { setImage(null); setImageFile(null); }} className="w-full py-3 border border-gray-600 rounded-xl">Remove Image</button>
            </div>
          ) : (
            <div className="h-80 flex flex-col items-center justify-center border-2 border-dashed border-gray-600 rounded-xl text-gray-400">
              <div className="text-5xl mb-4">🖼️</div>
              <p className="text-lg">No image selected</p>
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-between mt-8">
        <button onClick={() => setStep(3)} className="px-6 py-3 border border-gray-600 rounded-xl">← Back</button>
        <button disabled={!imageFile} onClick={() => setStep(5)} 
          className="px-6 py-3 bg-purple-600 rounded-xl disabled:opacity-50">Next →</button>
      </div>
    </motion.div>
  );

  const Step5Form = () => (
    <motion.div initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} className="max-w-4xl mx-auto">
      <h2 className="text-4xl font-bold mb-2 text-center">Vehicle Details</h2>
      <div className="bg-gray-800 rounded-2xl p-8 mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { field: "type", label: "Vehicle Type", options: ["Hatchback", "Sedan", "SUV", "MUV"] },
            { field: "color", label: "Color", options: ["White", "Black", "Red", "Blue", "Silver"] },
            { field: "year", label: "Year", options: Array.from({ length: 25 }, (_, i) => 2024 - i) },
            { field: "fuel", label: "Fuel Type", options: ["Petrol", "Diesel", "Electric", "Hybrid"] }
          ].map(({ field, label, options }) => (
            <div key={field}>
              <label className="block text-sm mb-3">{label} *</label>
              <select value={carDetails[field]} onChange={(e) => handleCarDetailChange(field, e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white">
                <option value="">Select {label}</option>
                {options.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-between">
        <button onClick={() => setStep(4)} className="px-6 py-3 border border-gray-600 rounded-xl">← Back</button>
        <button disabled={!carDetails.type || !carDetails.color || !carDetails.year || !carDetails.fuel} onClick={handlePredict}
          className="px-6 py-3 bg-purple-600 rounded-xl disabled:opacity-50">🔍 Analyze Damage</button>
      </div>
    </motion.div>
  );

  const Step6Loading = () => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl mx-auto text-center mt-20">
      <div className="bg-gray-800 rounded-2xl p-12">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity }} 
          className="w-24 h-24 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-8" />
        <h2 className="text-3xl font-bold mb-4">AI is Analyzing Damage</h2>
        <p className="text-gray-300">Processing your image with our AI models...</p>
      </div>
    </motion.div>
  );

  const Step7Results = () => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-7xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-4xl font-bold mb-2">Damage Analysis Complete</h2>
        <p className="text-gray-400 text-xl">Detailed assessment of your vehicle damage</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {[
          { value: damagedParts.length, label: "Damage Areas", color: "purple" },
          { value: damagedParts.filter(p => p.severity_label?.toLowerCase() === 'high').length, label: "Critical Damages", color: "yellow" },
          { value: `₹${totalCost.toLocaleString()}`, label: "Total Cost", color: "green" }
        ].map((item, idx) => (
          <div key={idx} className="bg-gray-800 rounded-2xl p-6 text-center">
            <div className={`text-3xl font-bold text-${item.color}-400 mb-2`}>{item.value}</div>
            <div className="text-gray-400">{item.label}</div>
          </div>
        ))}
      </div>

      <div id="printable-results" className="no-print">
        {prediction?.annotated_image && (
          <div className="mb-8 bg-gray-800 rounded-2xl p-6">
            <h3 className="text-2xl font-bold mb-4">AI Damage Detection</h3>
            <img src={`${API_BASE_URL}/${prediction.annotated_image}`} alt="AI Analysis" className="max-w-full max-h-96 rounded-xl mx-auto" />
          </div>
        )}

        <div className="bg-gray-800 rounded-2xl p-6 mb-8">
          <h3 className="text-2xl font-bold mb-6">Damage Breakdown</h3>
          {damagedParts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-600">
                    {["Damage Part", "Severity", "Confidence", "Repair Cost (₹)", "Damage Image"].map(header => (
                      <th key={header} className="px-6 py-4 text-lg font-semibold">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {damagedParts.map((part, idx) => (
                    <tr key={idx} className="border-b border-gray-700">
                      <td className="px-6 py-4 font-medium capitalize">{part.part?.replace(/_/g, ' ')}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                          part.severity_label?.toLowerCase() === 'high' ? 'bg-red-500/20 text-red-400' : 
                          part.severity_label?.toLowerCase() === 'medium' ? 'bg-yellow-500/20 text-yellow-400' : 
                          'bg-green-500/20 text-green-400'
                        }`}>{part.severity_label}</span>
                      </td>
                      <td className="px-6 py-4">{(part.confidence * 100).toFixed(1)}%</td>
                      <td className="px-6 py-4 text-green-400 font-semibold">₹{part.cost?.toLocaleString()}</td>
                      <td className="px-6 py-4">
                        {part.image && <img src={`${API_BASE_URL}/${part.image}`} alt="Damage" className="w-20 h-20 object-cover rounded-lg" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-5xl mb-4">✅</div>
              <h4 className="text-xl font-semibold mb-2">No Significant Damage</h4>
              <p className="text-gray-400">Your vehicle appears to be in good condition</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-between gap-4 no-print">
        <button onClick={resetFlow} className="px-8 py-4 border border-gray-600 rounded-xl">🏠 New Assessment</button>
        <div className="flex gap-4">
          <button onClick={() => setStep(4)} className="px-6 py-4 border border-gray-600 rounded-xl">📸 Re-analyze</button>
          <button onClick={printResults} className="px-6 py-4 bg-green-600 rounded-xl">🖨️ Print Report</button>
        </div>
      </div>
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
      
      {/* Login Alert Popup */}
      {showLoginAlert && <LoginAlert />}
    </div>
  );
}