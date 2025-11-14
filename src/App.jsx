import React, { useState, useMemo, useEffect } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import * as XLSX from "xlsx";

const EnergyUsageAnalyzer = () => {
  const [comparisonMode, setComparisonMode] = useState(false);
  const [data, setData] = useState(null);
  const [data1, setData1] = useState(null);
  const [data2, setData2] = useState(null);
  const [selectedView, setSelectedView] = useState("daily-pattern");
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedDate1, setSelectedDate1] = useState(null);
  const [selectedDate2, setSelectedDate2] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loading1, setLoading1] = useState(false);
  const [loading2, setLoading2] = useState(false);
  const [kwhCost, setKwhCost] = useState(() => {
    // Load kWh cost from localStorage on initial render
    const saved = localStorage.getItem("kwhCost");
    return saved ? parseFloat(saved) : 0.12; // Default to $0.12/kWh
  });

  // Save kWh cost to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("kwhCost", kwhCost.toString());
  }, [kwhCost]);

  // Common file processing logic
  const processExcelFile = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { cellDates: true });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    // Filter out invalid rows (blank rows, confidentiality notice, etc.)
    const filteredData = jsonData.filter((row) => {
      // Skip rows without a Date field
      if (!row.Date) return false;

      // Skip rows where Date contains the confidentiality notice text
      if (typeof row.Date === "string") {
        const lowerDate = row.Date.toLowerCase();
        if (
          lowerDate.includes("information contained") ||
          lowerDate.includes("confidential") ||
          lowerDate.includes("unauthorized use")
        ) {
          return false;
        }
      }

      return true;
    });

    // Process the data
    const processedData = filteredData.map((row, idx) => {
      let date;

      // Handle different possible date formats
      if (row.Date instanceof Date && !isNaN(row.Date)) {
        date = row.Date;
      } else if (typeof row.Date === "number") {
        // Excel serial date number (days since 1900-01-01)
        date = new Date((row.Date - 25569) * 86400 * 1000);
      } else if (typeof row.Date === "string") {
        date = new Date(row.Date);
      } else {
        console.warn(`Could not parse date at row ${idx}:`, row.Date);
        date = new Date();
      }

      // Validate the parsed date
      if (isNaN(date.getTime())) {
        console.warn(`Invalid date at row ${idx}:`, row.Date);
        date = new Date();
      }

      const timeIntervals = {};

      // Extract all 15-minute intervals
      Object.keys(row).forEach((key) => {
        if (key.includes("AM") || key.includes("PM")) {
          timeIntervals[key] = row[key] || 0;
        }
      });

      return {
        date: date,
        dateStr: date.toLocaleDateString("en-US", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }),
        min: row.Min || 0,
        max: row.Max || 0,
        total: row.Total || 0,
        intervals: timeIntervals,
      };
    });

    // Sort by date
    processedData.sort((a, b) => a.date - b.date);
    return processedData;
  };

  // Parse the Excel file (single mode)
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    try {
      const processedData = await processExcelFile(file);
      setData(processedData);
      setSelectedDate(processedData[0]?.dateStr);
    } catch (error) {
      alert("Error parsing file: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Parse first file (comparison mode)
  const handleFileUpload1 = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading1(true);
    try {
      const processedData = await processExcelFile(file);
      setData1(processedData);
      setSelectedDate1(processedData[0]?.dateStr);
    } catch (error) {
      alert("Error parsing first file: " + error.message);
    } finally {
      setLoading1(false);
    }
  };

  // Parse second file (comparison mode)
  const handleFileUpload2 = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading2(true);
    try {
      const processedData = await processExcelFile(file);
      setData2(processedData);
      setSelectedDate2(processedData[0]?.dateStr);
    } catch (error) {
      alert("Error parsing second file: " + error.message);
    } finally {
      setLoading2(false);
    }
  };

  // Auto-order datasets chronologically - earlier period should always be data1
  useEffect(() => {
    if (data1 && data2 && data1.length > 0 && data2.length > 0) {
      const date1Start = data1[0].date;
      const date2Start = data2[0].date;

      // If data2 has an earlier start date, swap them
      if (date2Start < date1Start) {
        const temp = data1;
        setData1(data2);
        setData2(temp);
        setSelectedDate1(data2[0]?.dateStr);
        setSelectedDate2(temp[0]?.dateStr);
      }
    }
  }, [data1, data2]);

  // Get time intervals in order
  const timeIntervals = useMemo(() => {
    if (!data || data.length === 0) return [];

    const intervals = Object.keys(data[0].intervals);
    // Sort to ensure proper time order
    return intervals.sort((a, b) => {
      const parseTime = (time) => {
        const [t, period] = time.split(" ");
        let [hours, minutes] = t.split(":").map(Number);
        if (period === "PM" && hours !== 12) hours += 12;
        if (period === "AM" && hours === 12) hours = 0;
        return hours * 60 + minutes;
      };
      return parseTime(a) - parseTime(b);
    });
  }, [data]);

  // Generate daily pattern view data
  const dailyPatternData = useMemo(() => {
    if (!data || !selectedDate) return [];

    const dayData = data.find((d) => d.dateStr === selectedDate);
    if (!dayData) return [];

    return timeIntervals.map((time, idx) => ({
      time: time,
      usage: dayData.intervals[time] || 0,
      index: idx,
    }));
  }, [data, selectedDate, timeIntervals]);

  // Generate average daily pattern
  const avgDailyPattern = useMemo(() => {
    if (!data || data.length === 0) return [];

    const avgByInterval = {};
    timeIntervals.forEach((interval) => {
      const sum = data.reduce(
        (acc, day) => acc + (day.intervals[interval] || 0),
        0
      );
      avgByInterval[interval] = sum / data.length;
    });

    return timeIntervals.map((time, idx) => ({
      time: time,
      avgUsage: avgByInterval[time],
      index: idx,
    }));
  }, [data, timeIntervals]);

  // Generate daily totals over time
  const dailyTotalsData = useMemo(() => {
    if (!data) return [];

    return data.map((day) => ({
      date: day.dateStr,
      total: day.total,
      min: day.min,
      max: day.max,
    }));
  }, [data]);

  // Generate heatmap data (usage by hour of day)
  const hourlyAverages = useMemo(() => {
    if (!data || data.length === 0) return [];

    const hourlyData = Array(24)
      .fill(0)
      .map(() => ({ sum: 0, count: 0 }));

    data.forEach((day) => {
      timeIntervals.forEach((interval) => {
        const [time, period] = interval.split(" ");
        let [hours] = time.split(":").map(Number);

        if (period === "PM" && hours !== 12) hours += 12;
        if (period === "AM" && hours === 12) hours = 0;

        hourlyData[hours].sum += day.intervals[interval] || 0;
        hourlyData[hours].count += 1;
      });
    });

    return hourlyData.map((data, hour) => ({
      hour: `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour} ${
        hour < 12 ? "AM" : "PM"
      }`,
      avgUsage: data.count > 0 ? data.sum / data.count : 0,
    }));
  }, [data, timeIntervals]);

  // Calculate statistics for a dataset
  const calculateStatistics = (dataSet) => {
    if (!dataSet || dataSet.length === 0) return null;

    const totalUsage = dataSet.reduce((sum, day) => sum + day.total, 0);
    const avgDailyUsage = totalUsage / dataSet.length;
    const maxDailyUsage = Math.max(...dataSet.map((d) => d.total));
    const minDailyUsage = Math.min(...dataSet.map((d) => d.total));

    // Calculate costs
    const totalCost = totalUsage * kwhCost;
    const avgDailyCost = avgDailyUsage * kwhCost;
    const maxDailyCost = maxDailyUsage * kwhCost;
    const minDailyCost = minDailyUsage * kwhCost;

    // Find peak usage time across all days
    const allIntervalUsages = {};
    dataSet.forEach((day) => {
      Object.entries(day.intervals).forEach(([time, usage]) => {
        if (!allIntervalUsages[time]) allIntervalUsages[time] = [];
        allIntervalUsages[time].push(usage);
      });
    });

    const avgIntervalUsages = Object.entries(allIntervalUsages).map(
      ([time, usages]) => ({
        time,
        avg: usages.reduce((a, b) => a + b, 0) / usages.length,
      })
    );

    const peakTime = avgIntervalUsages.reduce((max, curr) =>
      curr.avg > max.avg ? curr : max
    );

    return {
      totalUsage: totalUsage.toFixed(2),
      avgDailyUsage: avgDailyUsage.toFixed(2),
      maxDailyUsage: maxDailyUsage.toFixed(2),
      minDailyUsage: minDailyUsage.toFixed(2),
      totalCost: totalCost.toFixed(2),
      avgDailyCost: avgDailyCost.toFixed(2),
      maxDailyCost: maxDailyCost.toFixed(2),
      minDailyCost: minDailyCost.toFixed(2),
      peakTime: peakTime.time,
      peakAvgUsage: peakTime.avg.toFixed(2),
      daysAnalyzed: dataSet.length,
      dateRange: `${dataSet[0].dateStr} - ${dataSet[dataSet.length - 1].dateStr}`,
    };
  };

  // Calculate statistics
  const statistics = useMemo(() => {
    return calculateStatistics(data);
  }, [data, kwhCost]);

  const statistics1 = useMemo(() => {
    return calculateStatistics(data1);
  }, [data1, kwhCost]);

  const statistics2 = useMemo(() => {
    return calculateStatistics(data2);
  }, [data2, kwhCost]);

  // Calculate comparison deltas
  const comparisonStats = useMemo(() => {
    if (!statistics1 || !statistics2) return null;

    const totalUsageDiff = parseFloat(statistics2.totalUsage) - parseFloat(statistics1.totalUsage);
    const totalUsagePercent = (totalUsageDiff / parseFloat(statistics1.totalUsage)) * 100;

    const avgDailyUsageDiff = parseFloat(statistics2.avgDailyUsage) - parseFloat(statistics1.avgDailyUsage);
    const avgDailyUsagePercent = (avgDailyUsageDiff / parseFloat(statistics1.avgDailyUsage)) * 100;

    const totalCostDiff = parseFloat(statistics2.totalCost) - parseFloat(statistics1.totalCost);
    const totalCostPercent = (totalCostDiff / parseFloat(statistics1.totalCost)) * 100;

    const avgDailyCostDiff = parseFloat(statistics2.avgDailyCost) - parseFloat(statistics1.avgDailyCost);
    const avgDailyCostPercent = (avgDailyCostDiff / parseFloat(statistics1.avgDailyCost)) * 100;

    return {
      totalUsageDiff: totalUsageDiff.toFixed(2),
      totalUsagePercent: totalUsagePercent.toFixed(1),
      avgDailyUsageDiff: avgDailyUsageDiff.toFixed(2),
      avgDailyUsagePercent: avgDailyUsagePercent.toFixed(1),
      totalCostDiff: totalCostDiff.toFixed(2),
      totalCostPercent: totalCostPercent.toFixed(1),
      avgDailyCostDiff: avgDailyCostDiff.toFixed(2),
      avgDailyCostPercent: avgDailyCostPercent.toFixed(1),
    };
  }, [statistics1, statistics2]);

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-300 rounded shadow-lg">
          <p className="text-sm font-semibold">
            {payload[0].payload.time || payload[0].payload.date}
          </p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}:{" "}
              {typeof entry.value === "number"
                ? entry.value.toFixed(2)
                : entry.value}{" "}
              kWh
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (!comparisonMode && !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-xl p-8">
            <h1 className="text-4xl font-bold text-gray-800 mb-2">
              Energy Usage Analyzer
            </h1>
            <p className="text-gray-600 mb-8">
              Upload your 15-minute interval energy data to visualize and
              analyze usage patterns
            </p>

            {/* Mode selector */}
            <div className="mb-6">
              <p className="text-sm font-medium text-gray-700 mb-3">Select mode:</p>
              <div className="flex gap-4">
                <button
                  onClick={() => setComparisonMode(false)}
                  className="flex-1 px-6 py-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  <div className="font-semibold text-lg mb-1">Single Analysis</div>
                  <div className="text-sm opacity-90">Analyze one time period</div>
                </button>
                <button
                  onClick={() => setComparisonMode(true)}
                  className="flex-1 px-6 py-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  <div className="font-semibold text-lg mb-1">Comparison Mode</div>
                  <div className="text-sm opacity-90">Compare two time periods</div>
                </button>
              </div>
            </div>

            <div className="border-4 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-indigo-500 transition-colors">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
                disabled={loading}
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer inline-flex flex-col items-center"
              >
                <svg
                  className="w-16 h-16 text-gray-400 mb-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <span className="text-xl font-semibold text-gray-700 mb-2">
                  {loading ? "Processing..." : "Click to upload Excel file"}
                </span>
                <span className="text-sm text-gray-500">
                  Supports .xlsx and .xls formats with 15-minute interval data
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Comparison mode upload screen
  if (comparisonMode && (!data1 || !data2)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white rounded-lg shadow-xl p-8">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h1 className="text-4xl font-bold text-gray-800 mb-2">
                  Comparison Mode
                </h1>
                <p className="text-gray-600">
                  Upload two Excel files to compare energy usage across different time periods
                </p>
                <p className="text-sm text-indigo-600 mt-1">
                  Files will be automatically ordered chronologically (earlier period on left)
                </p>
              </div>
              <button
                onClick={() => {
                  setComparisonMode(false);
                  setData1(null);
                  setData2(null);
                }}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Switch to Single Mode
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* First file upload */}
              <div className="border-4 border-dashed border-blue-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload1}
                  className="hidden"
                  id="file-upload-1"
                  disabled={loading1}
                />
                <label
                  htmlFor="file-upload-1"
                  className="cursor-pointer inline-flex flex-col items-center"
                >
                  <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-2xl font-bold mb-3">
                    1
                  </div>
                  <span className="text-xl font-semibold text-gray-700 mb-2">
                    {loading1 ? "Processing..." : data1 ? "File 1 Loaded ✓" : "First Excel File"}
                  </span>
                  <span className="text-sm text-gray-500 mb-3">
                    {data1 ? `${data1.length} days loaded` : "Click to upload (any time period)"}
                  </span>
                  {data1 && (
                    <div className="text-xs text-gray-600 bg-blue-50 px-3 py-2 rounded">
                      {data1[0].dateStr} - {data1[data1.length - 1].dateStr}
                    </div>
                  )}
                </label>
              </div>

              {/* Second file upload */}
              <div className="border-4 border-dashed border-purple-300 rounded-lg p-8 text-center hover:border-purple-500 transition-colors">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload2}
                  className="hidden"
                  id="file-upload-2"
                  disabled={loading2}
                />
                <label
                  htmlFor="file-upload-2"
                  className="cursor-pointer inline-flex flex-col items-center"
                >
                  <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-2xl font-bold mb-3">
                    2
                  </div>
                  <span className="text-xl font-semibold text-gray-700 mb-2">
                    {loading2 ? "Processing..." : data2 ? "File 2 Loaded ✓" : "Second Excel File"}
                  </span>
                  <span className="text-sm text-gray-500 mb-3">
                    {data2 ? `${data2.length} days loaded` : "Click to upload (any time period)"}
                  </span>
                  {data2 && (
                    <div className="text-xs text-gray-600 bg-purple-50 px-3 py-2 rounded">
                      {data2[0].dateStr} - {data2[data2.length - 1].dateStr}
                    </div>
                  )}
                </label>
              </div>
            </div>

            {data1 && data2 && (
              <div className="mt-6 text-center">
                <p className="text-green-600 font-semibold">
                  Both files loaded successfully! The comparison dashboard will appear shortly...
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Comparison mode dashboard
  if (comparisonMode && data1 && data2) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="bg-white rounded-lg shadow-xl p-6 mb-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-800">
                  Comparison Dashboard
                </h1>
                <div className="flex gap-4 mt-2 text-sm">
                  <span className="text-blue-600 font-medium">Period 1 (Earlier): {statistics1.dateRange}</span>
                  <span className="text-gray-400">vs</span>
                  <span className="text-purple-600 font-medium">Period 2 (Later): {statistics2.dateRange}</span>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                    kWh Cost ($):
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={kwhCost}
                    onChange={(e) => setKwhCost(parseFloat(e.target.value) || 0)}
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <button
                  onClick={() => {
                    setData1(null);
                    setData2(null);
                  }}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors whitespace-nowrap"
                >
                  Upload New Files
                </button>
              </div>
            </div>
          </div>

          {/* Comparison Summary Cards */}
          {comparisonStats && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-700 mb-3">Comparison Summary (Later vs Earlier Period)</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg shadow p-5">
                  <div className="text-sm text-gray-600 mb-1">Total Usage Difference</div>
                  <div className={`text-2xl font-bold ${parseFloat(comparisonStats.totalUsageDiff) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {parseFloat(comparisonStats.totalUsageDiff) > 0 ? '+' : ''}{comparisonStats.totalUsageDiff} kWh
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {parseFloat(comparisonStats.totalUsagePercent) > 0 ? '+' : ''}{comparisonStats.totalUsagePercent}% change
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow p-5">
                  <div className="text-sm text-gray-600 mb-1">Avg Daily Difference</div>
                  <div className={`text-2xl font-bold ${parseFloat(comparisonStats.avgDailyUsageDiff) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {parseFloat(comparisonStats.avgDailyUsageDiff) > 0 ? '+' : ''}{comparisonStats.avgDailyUsageDiff} kWh
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {parseFloat(comparisonStats.avgDailyUsagePercent) > 0 ? '+' : ''}{comparisonStats.avgDailyUsagePercent}% change
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow p-5">
                  <div className="text-sm text-gray-600 mb-1">Total Cost Difference</div>
                  <div className={`text-2xl font-bold ${parseFloat(comparisonStats.totalCostDiff) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {parseFloat(comparisonStats.totalCostDiff) > 0 ? '+$' : '-$'}{Math.abs(parseFloat(comparisonStats.totalCostDiff)).toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {parseFloat(comparisonStats.totalCostPercent) > 0 ? '+' : ''}{comparisonStats.totalCostPercent}% change
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow p-5">
                  <div className="text-sm text-gray-600 mb-1">Avg Daily Cost Diff</div>
                  <div className={`text-2xl font-bold ${parseFloat(comparisonStats.avgDailyCostDiff) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {parseFloat(comparisonStats.avgDailyCostDiff) > 0 ? '+$' : '-$'}{Math.abs(parseFloat(comparisonStats.avgDailyCostDiff)).toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {parseFloat(comparisonStats.avgDailyCostPercent) > 0 ? '+' : ''}{comparisonStats.avgDailyCostPercent}% change
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Side-by-side statistics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Period 1 Statistics */}
            <div>
              <h2 className="text-lg font-semibold text-blue-700 mb-3">Period 1 (Earlier) - {statistics1.dateRange}</h2>
              <div className="space-y-3">
                <div className="bg-white rounded-lg shadow p-4">
                  <div className="text-sm text-gray-600 mb-1">Total Usage</div>
                  <div className="text-xl font-bold text-blue-600">{statistics1.totalUsage} kWh</div>
                  <div className="text-xs text-gray-500 mt-1">{statistics1.daysAnalyzed} days</div>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <div className="text-sm text-gray-600 mb-1">Avg Daily Usage</div>
                  <div className="text-xl font-bold text-blue-600">{statistics1.avgDailyUsage} kWh</div>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <div className="text-sm text-gray-600 mb-1">Total Cost</div>
                  <div className="text-xl font-bold text-blue-600">${statistics1.totalCost}</div>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <div className="text-sm text-gray-600 mb-1">Peak Time</div>
                  <div className="text-xl font-bold text-blue-600">{statistics1.peakTime}</div>
                  <div className="text-xs text-gray-500 mt-1">Avg: {statistics1.peakAvgUsage} kWh</div>
                </div>
              </div>
            </div>

            {/* Period 2 Statistics */}
            <div>
              <h2 className="text-lg font-semibold text-purple-700 mb-3">Period 2 (Later) - {statistics2.dateRange}</h2>
              <div className="space-y-3">
                <div className="bg-white rounded-lg shadow p-4">
                  <div className="text-sm text-gray-600 mb-1">Total Usage</div>
                  <div className="text-xl font-bold text-purple-600">{statistics2.totalUsage} kWh</div>
                  <div className="text-xs text-gray-500 mt-1">{statistics2.daysAnalyzed} days</div>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <div className="text-sm text-gray-600 mb-1">Avg Daily Usage</div>
                  <div className="text-xl font-bold text-purple-600">{statistics2.avgDailyUsage} kWh</div>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <div className="text-sm text-gray-600 mb-1">Total Cost</div>
                  <div className="text-xl font-bold text-purple-600">${statistics2.totalCost}</div>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <div className="text-sm text-gray-600 mb-1">Peak Time</div>
                  <div className="text-xl font-bold text-purple-600">{statistics2.peakTime}</div>
                  <div className="text-xs text-gray-500 mt-1">Avg: {statistics2.peakAvgUsage} kWh</div>
                </div>
              </div>
            </div>
          </div>

          {/* Comparison Charts - Daily Totals */}
          <div className="bg-white rounded-lg shadow-xl p-6 mb-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Daily Usage Comparison</h2>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="index"
                  type="number"
                  domain={[0, Math.max(data1.length, data2.length) - 1]}
                  tickFormatter={(val) => `Day ${val + 1}`}
                  label={{ value: "Day Number", position: "insideBottom", offset: -5 }}
                />
                <YAxis label={{ value: "kWh", angle: -90, position: "insideLeft" }} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-white p-3 border border-gray-300 rounded shadow-lg">
                          {payload.map((entry, index) => (
                            <div key={index}>
                              <p className="text-sm font-semibold" style={{ color: entry.color }}>
                                {entry.name}
                              </p>
                              <p className="text-sm" style={{ color: entry.color }}>
                                {entry.payload[entry.dataKey + 'Date']}: {entry.value?.toFixed(2)} kWh
                              </p>
                            </div>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend />
                <Line
                  data={data1.map((d, i) => ({ index: i, period1: d.total, period1Date: d.dateStr }))}
                  type="monotone"
                  dataKey="period1"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  name="Period 1 (Earlier)"
                  dot={false}
                />
                <Line
                  data={data2.map((d, i) => ({ index: i, period2: d.total, period2Date: d.dateStr }))}
                  type="monotone"
                  dataKey="period2"
                  stroke="#a855f7"
                  strokeWidth={2}
                  name="Period 2 (Later)"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Average Daily Pattern Comparison */}
          <div className="bg-white rounded-lg shadow-xl p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Average Daily Pattern Comparison</h2>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="index"
                  type="number"
                  domain={[0, 95]}
                  tickFormatter={(val) => {
                    const hours = Math.floor(val / 4);
                    const mins = (val % 4) * 15;
                    return `${hours === 0 ? 12 : hours > 12 ? hours - 12 : hours}${hours < 12 ? 'am' : 'pm'}`;
                  }}
                  interval={11}
                  label={{ value: "Time of Day", position: "insideBottom", offset: -5 }}
                />
                <YAxis label={{ value: "Avg kWh", angle: -90, position: "insideLeft" }} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-white p-3 border border-gray-300 rounded shadow-lg">
                          <p className="text-sm font-semibold mb-1">{payload[0]?.payload.time}</p>
                          {payload.map((entry, index) => (
                            <p key={index} className="text-sm" style={{ color: entry.color }}>
                              {entry.name}: {entry.value?.toFixed(2)} kWh
                            </p>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend />
                <Line
                  data={(() => {
                    const timeIntervals1 = Object.keys(data1[0].intervals).sort((a, b) => {
                      const parseTime = (time) => {
                        const [t, period] = time.split(" ");
                        let [hours, minutes] = t.split(":").map(Number);
                        if (period === "PM" && hours !== 12) hours += 12;
                        if (period === "AM" && hours === 12) hours = 0;
                        return hours * 60 + minutes;
                      };
                      return parseTime(a) - parseTime(b);
                    });

                    const avgByInterval = {};
                    timeIntervals1.forEach((interval) => {
                      const sum = data1.reduce((acc, day) => acc + (day.intervals[interval] || 0), 0);
                      avgByInterval[interval] = sum / data1.length;
                    });

                    return timeIntervals1.map((time, idx) => ({
                      index: idx,
                      time: time,
                      period1Avg: avgByInterval[time]
                    }));
                  })()}
                  type="monotone"
                  dataKey="period1Avg"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  name="Period 1 (Earlier) Avg"
                  dot={false}
                />
                <Line
                  data={(() => {
                    const timeIntervals2 = Object.keys(data2[0].intervals).sort((a, b) => {
                      const parseTime = (time) => {
                        const [t, period] = time.split(" ");
                        let [hours, minutes] = t.split(":").map(Number);
                        if (period === "PM" && hours !== 12) hours += 12;
                        if (period === "AM" && hours === 12) hours = 0;
                        return hours * 60 + minutes;
                      };
                      return parseTime(a) - parseTime(b);
                    });

                    const avgByInterval = {};
                    timeIntervals2.forEach((interval) => {
                      const sum = data2.reduce((acc, day) => acc + (day.intervals[interval] || 0), 0);
                      avgByInterval[interval] = sum / data2.length;
                    });

                    return timeIntervals2.map((time, idx) => ({
                      index: idx,
                      time: time,
                      period2Avg: avgByInterval[time]
                    }));
                  })()}
                  type="monotone"
                  dataKey="period2Avg"
                  stroke="#a855f7"
                  strokeWidth={2}
                  name="Period 2 (Later) Avg"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-sm text-gray-600 mt-4 text-center">
              Comparing average 15-minute interval usage patterns across all days
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-xl p-6 mb-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">
                Energy Usage Dashboard
              </h1>
              <p className="text-gray-600 mt-1">{statistics.dateRange}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                  kWh Cost ($):
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={kwhCost}
                  onChange={(e) => setKwhCost(parseFloat(e.target.value) || 0)}
                  className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={() => setData(null)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap"
              >
                Upload New File
              </button>
            </div>
          </div>
        </div>

        {/* Statistics Cards */}
        {statistics && (
          <>
            {/* Usage Statistics */}
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-gray-700 mb-3">Energy Usage</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg shadow p-5">
                  <div className="text-sm text-gray-600 mb-1">Total Usage</div>
                  <div className="text-2xl font-bold text-indigo-600">
                    {statistics.totalUsage} kWh
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {statistics.dateRange}
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow p-5">
                  <div className="text-sm text-gray-600 mb-1">Avg Daily Usage</div>
                  <div className="text-2xl font-bold text-green-600">
                    {statistics.avgDailyUsage} kWh
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {statistics.daysAnalyzed} days analyzed
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow p-5">
                  <div className="text-sm text-gray-600 mb-1">Daily Range</div>
                  <div className="text-2xl font-bold text-orange-600">
                    {statistics.minDailyUsage} - {statistics.maxDailyUsage}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Min - Max kWh</div>
                </div>
                <div className="bg-white rounded-lg shadow p-5">
                  <div className="text-sm text-gray-600 mb-1">Peak Time</div>
                  <div className="text-2xl font-bold text-red-600">
                    {statistics.peakTime}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Avg: {statistics.peakAvgUsage} kWh
                  </div>
                </div>
              </div>
            </div>

            {/* Cost Statistics */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-700 mb-3">Cost Analysis</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg shadow p-5">
                  <div className="text-sm text-gray-600 mb-1">Total Cost</div>
                  <div className="text-2xl font-bold text-purple-600">
                    ${statistics.totalCost}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {statistics.dateRange}
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow p-5">
                  <div className="text-sm text-gray-600 mb-1">Avg Daily Cost</div>
                  <div className="text-2xl font-bold text-teal-600">
                    ${statistics.avgDailyCost}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {statistics.daysAnalyzed} days analyzed
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow p-5">
                  <div className="text-sm text-gray-600 mb-1">Daily Cost Range</div>
                  <div className="text-2xl font-bold text-amber-600">
                    ${statistics.minDailyCost} - ${statistics.maxDailyCost}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Min - Max daily</div>
                </div>
                <div className="bg-white rounded-lg shadow p-5">
                  <div className="text-sm text-gray-600 mb-1">Rate</div>
                  <div className="text-2xl font-bold text-cyan-600">
                    ${kwhCost.toFixed(3)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">per kWh</div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* View Selector */}
        <div className="bg-white rounded-lg shadow-xl p-4 mb-6">
          <div className="flex flex-wrap gap-2">
            {[
              { id: "daily-pattern", label: "Daily Pattern", icon: "📊" },
              { id: "avg-pattern", label: "Average Pattern", icon: "📈" },
              { id: "daily-totals", label: "Daily Totals", icon: "📉" },
              { id: "hourly-avg", label: "Hourly Averages", icon: "⏰" },
            ].map((view) => (
              <button
                key={view.id}
                onClick={() => setSelectedView(view.id)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  selectedView === view.id
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {view.icon} {view.label}
              </button>
            ))}
          </div>
        </div>

        {/* Date selector for daily pattern view */}
        {selectedView === "daily-pattern" && (
          <div className="bg-white rounded-lg shadow-xl p-4 mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Date:
            </label>
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full md:w-auto px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              {data.map((day) => (
                <option key={day.dateStr} value={day.dateStr}>
                  {day.dateStr} - {day.total.toFixed(2)} kWh
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Visualization */}
        <div className="bg-white rounded-lg shadow-xl p-6">
          {selectedView === "daily-pattern" && (
            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-4">
                Energy Usage - {selectedDate}
              </h2>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={dailyPatternData}>
                  <defs>
                    <linearGradient id="colorUsage" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8} />
                      <stop
                        offset="95%"
                        stopColor="#6366f1"
                        stopOpacity={0.1}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 10 }}
                    interval={Math.floor(dailyPatternData.length / 12)}
                  />
                  <YAxis
                    label={{ value: "kWh", angle: -90, position: "insideLeft" }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="usage"
                    stroke="#6366f1"
                    fillOpacity={1}
                    fill="url(#colorUsage)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {selectedView === "avg-pattern" && (
            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-4">
                Average Daily Usage Pattern
              </h2>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={avgDailyPattern}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 10 }}
                    interval={Math.floor(avgDailyPattern.length / 12)}
                  />
                  <YAxis
                    label={{
                      value: "Avg kWh",
                      angle: -90,
                      position: "insideLeft",
                    }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="avgUsage"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
              <p className="text-sm text-gray-600 mt-4 text-center">
                Average usage across all {data.length} days in the dataset
              </p>
            </div>
          )}

          {selectedView === "daily-totals" && (
            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-4">
                Daily Total Usage Over Time
              </h2>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={dailyTotalsData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    interval={Math.floor(dailyTotalsData.length / 8)}
                  />
                  <YAxis
                    label={{ value: "kWh", angle: -90, position: "insideLeft" }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke="#6366f1"
                    strokeWidth={2}
                    name="Total Usage"
                  />
                  <Line
                    type="monotone"
                    dataKey="max"
                    stroke="#ef4444"
                    strokeWidth={1}
                    strokeDasharray="5 5"
                    name="Max 15-min"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {selectedView === "hourly-avg" && (
            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-4">
                Average Usage by Hour of Day
              </h2>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={hourlyAverages}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                  <YAxis
                    label={{
                      value: "Avg kWh",
                      angle: -90,
                      position: "insideLeft",
                    }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="avgUsage" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
              <p className="text-sm text-gray-600 mt-4 text-center">
                Average of all 15-minute intervals within each hour
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EnergyUsageAnalyzer;
