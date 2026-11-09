const TimeSeriesData = require('../models/TimeSeriesData');

class FIIDIITimeSeriesManager {
  constructor() {
    this.data = {
      day: [],
      month: [],
      year: []
    };
  }

  async initialize() {
    await this.loadFromDatabase();
  }

  async addNewDayRecord(newDayRecord) {
    try {
      // Step 1: Add to day array (rolling 30-day window)
      this.addDayRecord(newDayRecord);
      // Step 2: Update or create month record
      const monthKey = newDayRecord.date.substring(0, 7); // "2026-03"
      this.updateMonthRecord(monthKey);
      // Step 3: Update or create year record  
      const yearKey = newDayRecord.date.substring(0, 4); // "2026"
      this.updateYearRecord(yearKey);
      // Step 4: Save to MongoDB
      await this.saveToDatabase();      
      return this.data;
      
    } catch (error) {
      console.error(`[TimeSeries] ❌ Error adding record:`, error);
      throw error;
    }
  }

  addDayRecord(newRecord) {
    // Convert MongoDB document to plain object if needed
    const record = {
      date: newRecord.date,
      fii: newRecord.fii,
      dii: newRecord.dii,
      netFlow: newRecord.netFlow,
      timestamp: newRecord.fetchedAt || newRecord.timestamp || new Date()
    };

    // Check if date already exists (prevent duplicates)
    const existingIndex = this.data.day.findIndex(d => d.date === record.date);
    
    if (existingIndex >= 0) {
      // Update existing record
      this.data.day[existingIndex] = record;
    } else {
      // Add new record
      this.data.day.push(record);
      
      // Sort by date (newest first)
      this.data.day.sort((a, b) => new Date(b.date) - new Date(a.date));
      
      // Maintain rolling 30-day window
      if (this.data.day.length > 30) {
        const removed = this.data.day.pop(); // Remove oldest
      }
    }
  }

  updateMonthRecord(monthKey) {
    let monthRecord = this.data.month.find(m => m.month === monthKey);
    
    if (monthRecord) {
      // Update existing month - recalculate from all days in that month
      this.recalculateMonthFromDays(monthRecord, monthKey);
    } else {
      // Create new month record
      monthRecord = this.createNewMonthRecord(monthKey);
      if (monthRecord) {
        this.data.month.push(monthRecord);
        
        // Sort by month (newest first)
        this.data.month.sort((a, b) => b.month.localeCompare(a.month));
        
        // Maintain rolling 12-month window
        if (this.data.month.length > 12) {
          const removed = this.data.month.pop(); // Remove oldest
        }
      }
    }
  }

  recalculateMonthFromDays(monthRecord, monthKey) {
    // Get all days for this month from day array
    const monthDays = this.data.day.filter(d => d.date.startsWith(monthKey));
    
    if (monthDays.length > 0) {
      monthRecord.fiiTotal = this.roundTo2(monthDays.reduce((sum, d) => sum + d.fii, 0));
      monthRecord.diiTotal = this.roundTo2(monthDays.reduce((sum, d) => sum + d.dii, 0));
      monthRecord.netFlowTotal = this.roundTo2(monthDays.reduce((sum, d) => sum + d.netFlow, 0));
      monthRecord.avgFii = this.roundTo2(monthRecord.fiiTotal / monthDays.length);
      monthRecord.avgDii = this.roundTo2(monthRecord.diiTotal / monthDays.length);
      monthRecord.dayCount = monthDays.length;
      monthRecord.lastUpdated = new Date();
    }
  }

  createNewMonthRecord(monthKey) {
    // Get all days for this month from day array
    const monthDays = this.data.day.filter(d => d.date.startsWith(monthKey));
    
    if (monthDays.length === 0) return null;

    const fiiTotal = this.roundTo2(monthDays.reduce((sum, d) => sum + d.fii, 0));
    const diiTotal = this.roundTo2(monthDays.reduce((sum, d) => sum + d.dii, 0));
    const netFlowTotal = this.roundTo2(monthDays.reduce((sum, d) => sum + d.netFlow, 0));

    return {
      month: monthKey,
      fiiTotal: fiiTotal,
      diiTotal: diiTotal,
      netFlowTotal: netFlowTotal,
      avgFii: this.roundTo2(fiiTotal / monthDays.length),
      avgDii: this.roundTo2(diiTotal / monthDays.length),
      dayCount: monthDays.length,
      lastUpdated: new Date()
    };
  }

  updateYearRecord(yearKey) {
    let yearRecord = this.data.year.find(y => y.year === yearKey);
    
    if (yearRecord) {
      // Update existing year - recalculate from months
      this.recalculateYearFromMonths(yearRecord, yearKey);
    } else {
      // Create new year record
      yearRecord = this.createNewYearRecord(yearKey);
      if (yearRecord) {
        this.data.year.push(yearRecord);
        
        // Sort by year (newest first) 
        this.data.year.sort((a, b) => b.year.localeCompare(a.year));
      }
    }
  }

  recalculateYearFromMonths(yearRecord, yearKey) {
    // Get all months for this year from month array
    const yearMonths = this.data.month.filter(m => m.month.startsWith(yearKey));
    
    if (yearMonths.length > 0) {
      yearRecord.fiiTotal = this.roundTo2(yearMonths.reduce((sum, m) => sum + m.fiiTotal, 0));
      yearRecord.diiTotal = this.roundTo2(yearMonths.reduce((sum, m) => sum + m.diiTotal, 0));
      yearRecord.netFlowTotal = this.roundTo2(yearMonths.reduce((sum, m) => sum + m.netFlowTotal, 0));
      
      const totalDays = yearMonths.reduce((sum, m) => sum + m.dayCount, 0);
      yearRecord.avgFii = totalDays > 0 ? this.roundTo2(yearRecord.fiiTotal / totalDays) : 0;
      yearRecord.avgDii = totalDays > 0 ? this.roundTo2(yearRecord.diiTotal / totalDays) : 0;
      yearRecord.monthCount = yearMonths.length;
      yearRecord.lastUpdated = new Date();
    }
  }

  createNewYearRecord(yearKey) {
    // Get all months for this year from month array
    const yearMonths = this.data.month.filter(m => m.month.startsWith(yearKey));
    
    if (yearMonths.length === 0) return null;

    const fiiTotal = this.roundTo2(yearMonths.reduce((sum, m) => sum + m.fiiTotal, 0));
    const diiTotal = this.roundTo2(yearMonths.reduce((sum, m) => sum + m.diiTotal, 0));
    const netFlowTotal = this.roundTo2(yearMonths.reduce((sum, m) => sum + m.netFlowTotal, 0));
    const totalDays = yearMonths.reduce((sum, m) => sum + m.dayCount, 0);

    return {
      year: yearKey,
      fiiTotal: fiiTotal,
      diiTotal: diiTotal,
      netFlowTotal: netFlowTotal,
      avgFii: totalDays > 0 ? this.roundTo2(fiiTotal / totalDays) : 0,
      avgDii: totalDays > 0 ? this.roundTo2(diiTotal / totalDays) : 0,
      monthCount: yearMonths.length,
      lastUpdated: new Date()
    };
  }

  roundTo2(num) {
    return Math.round(num * 100) / 100;
  }

  async saveToDatabase() {
    try {
      await TimeSeriesData.findOneAndUpdate(
        { version: "1.0" },
        { $set: { data: this.data, lastUpdated: new Date() } },
        { upsert: true }
      );
    } catch (error) {
      console.error(`[TimeSeries] ❌ Error saving to database:`, error);
      throw error;
    }
  }

  async loadFromDatabase() {
    try {
      const doc = await TimeSeriesData.findOne({ version: "1.0" });
      if (doc && doc.data) {
        this.data = doc.data;
      } else {
      }
    } catch (error) {
      console.error(`[TimeSeries] ❌ Error loading from database:`, error);
      // Continue with empty data structure
    }
  }

  // Getter methods for easy access to data
  getDays(limit = 30) {
    return this.data.day.slice(0, limit);
  }

  getMonths(limit = 12) {
    return this.data.month.slice(0, limit);
  }

  getYears() {
    return this.data.year;
  }

  // Get data for specific time periods
  getLast7Days() {
    return this.data.day.slice(0, 7);
  }

  getLast30Days() {
    return this.data.day.slice(0, 30);
  }

  getMonthlyTotals() {
    return this.data.month.map(m => ({
      month: m.month,
      fiiTotal: m.fiiTotal,
      diiTotal: m.diiTotal,
      netFlowTotal: m.netFlowTotal,
      dayCount: m.dayCount
    }));
  }

  getYearlyTotals() {
    return this.data.year.map(y => ({
      year: y.year,
      fiiTotal: y.fiiTotal,
      diiTotal: y.diiTotal,
      netFlowTotal: y.netFlowTotal,
      monthCount: y.monthCount
    }));
  }
}

module.exports = FIIDIITimeSeriesManager;