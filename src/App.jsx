import React, { useState, useMemo } from "react";
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
  const [data, setData] = useState(null);
  const [selectedView, setSelectedView] = useState("daily-pattern");
  const [selectedDate, setSelectedDate] = useState(null);
  const [loading, setLoading] = useState(false);

  // Parse the Excel file
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    try {
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

      setData(processedData);
      setSelectedDate(processedData[0]?.dateStr);
    } catch (error) {
      alert("Error parsing file: " + error.message);
    } finally {
      setLoading(false);
    }
  };

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

  // Calculate statistics
  const statistics = useMemo(() => {
    if (!data || data.length === 0) return null;

    console.log(data);

    const totalUsage = data.reduce((sum, day) => sum + day.total, 0);
    const avgDailyUsage = totalUsage / data.length;
    const maxDailyUsage = Math.max(...data.map((d) => d.total));
    const minDailyUsage = Math.min(...data.map((d) => d.total));

    // Find peak usage time across all days
    const allIntervalUsages = {};
    data.forEach((day) => {
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
      peakTime: peakTime.time,
      peakAvgUsage: peakTime.avg.toFixed(2),
      daysAnalyzed: data.length,
      dateRange: `${data[0].dateStr} - ${data[data.length - 1].dateStr}`,
    };
  }, [data]);

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

  if (!data) {
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-xl p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">
                Energy Usage Dashboard
              </h1>
              <p className="text-gray-600 mt-1">{statistics.dateRange}</p>
            </div>
            <button
              onClick={() => setData(null)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Upload New File
            </button>
          </div>
        </div>

        {/* Statistics Cards */}
        {statistics && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
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
