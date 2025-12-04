import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import axios from "axios";
import { useLocation } from "react-router-dom";
import { auth } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";

export default function AIDashboard() {
  const location = useLocation();

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
  const [user, setUser] = useState(null);
  const [showLoginAlert, setShowLoginAlert] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const API_BASE_URL = "https://vehicle-damage-dl-backend.onrender.com/";
  const ENDPOINTS = {
    VEHICLE_BRANDS: `${API_BASE_URL}vehicle-brands`,
    PREDICT: `${API_BASE_URL}predict`,
    HEALTH: `${API_BASE_URL}health`,
    STATIC: `${API_BASE_URL}static`,
  };

  useEffect(() => {
    checkBackendConnection();
    fetchVehicleBrands();
  }, []);

  const checkBackendConnection = async () => {
    try {
      await axios.get(ENDPOINTS.HEALTH, { timeout: 5000 });
      setConnectionStatus("connected");
    } catch {
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
    } catch {
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
    "MarutiSuzuki": ["Swift", "Baleno", "Dzire", "WagonR"],
  });

  const handleTryOurAI = () => {
    if (!user) setShowLoginAlert(true);
    else setStep(2);
  };

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
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoRef.current.srcObject = stream;
    } catch {
      alert("Camera access denied");
    }
  };

  const stopCamera = () =>
    videoRef.current?.srcObject?.getTracks().forEach((track) => track.stop());

  const capturePhoto = () => {
    const canvas = document.createElement("canvas");
    const video = videoRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      const file = new File([blob], "captured.jpg", { type: "image/jpeg" });
      setImageFile(file);
      setImage(URL.createObjectURL(file));
      stopCamera();
      setCapturing(false);
    });
  };

  const handleCarDetailChange = (field, value) => {
    setCarDetails((prev) => ({ ...prev, [field]: value }));
  };

  const handlePredict = async () => {
    if (!imageFile) return alert("Please upload image first");
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
        setDamagedParts(
          response.data.cost_results?.map((item, i) => ({
            part: item.damage_type,
            severity_label: item.severity,
            confidence: item.confidence,
            cost: item.cost,
            image: response.data.crops?.[i] || "",
          })) || []
        );
        setStep(7);
      } else {
        alert("Analysis failed");
        setStep(4);
      }
    } catch {
      alert("Server error during prediction");
      setStep(4);
    }

    setLoading(false);
  };

  const totalCost = damagedParts.reduce((sum, p) => sum + (p.cost || 0), 0);

  const Step7Results = () => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-6xl mx-auto mt-6">
      <h2 className="text-4xl font-bold mb-6 text-center">Damage Analysis Results</h2>

      <div id="printable-results">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-gray-800 p-5 rounded-xl">
            <h3 className="text-xl font-semibold mb-3">Uploaded Image</h3>
            <img src={image} className="rounded-xl w-full h-80 object-cover" />
          </div>

          <div className="bg-gray-800 p-5 rounded-xl">
            <h3 className="text-xl font-semibold mb-3">Summary</h3>
            <p className="mb-2">Brand: {selectedBrand}</p>
            <p className="mb-2">Model: {selectedModel}</p>
            <p className="mb-2">Total Repair Cost: ₹ {totalCost.toLocaleString()}</p>
          </div>
        </div>

        <table className="w-full mt-6 text-left border-collapse">
          <thead>
            <tr>
              <th className="p-3 border-b">Part</th>
              <th className="p-3 border-b">Severity</th>
              <th className="p-3 border-b">Confidence</th>
              <th className="p-3 border-b">Cost</th>
            </tr>
          </thead>
          <tbody>
            {damagedParts.map((p, i) => (
              <tr key={i} className="border-b">
                <td className="p-3">{p.part}</td>
                <td className="p-3">{p.severity_label}</td>
                <td className="p-3">{(p.confidence * 100).toFixed(1)}%</td>
                <td className="p-3">₹ {p.cost.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between mt-8">
        <button onClick={() => setStep(1)} className="px-6 py-3 border rounded-xl">🏠 Home</button>
        <button onClick={() => window.print()} className="px-6 py-3 bg-purple-600 rounded-xl">🖨 Print</button>
      </div>
    </motion.div>
  );

  return (
    <div className="px-6 py-10 text-white">
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
