// Token Radar Varian B - Dashboard JavaScript
// Farm-first layout with filtering, sorting, and protocol comparison

class TokenRadar {
  constructor() {
    this.data = null;
    this.filteredData = [];
    this.currentView = 'board';
    this.selectedProtocol = null;
    this.compareProtocol1 = null;
    this.compareProtocol2 = null;
    
    this.init();
  }

  init() {
    this.loadData();
    this.setupEventListeners();
  }

  loadData() {
    if (window.RADAR) {
      this.data = window.RADAR;
      this.filteredData = [...this.data.rows];
      this.render();
      this.populateFilters();
      document.getElementById('loading').style.display = 'none';
      document.getElementById('board-container').style.display = 'block';
    } else {
      document.getElementById('loading').textContent = 'Error: Data not loaded';
    }
  }

  setupEventListeners() {
    // View selector
    document.getElementById('view').addEventListener('change', (e) => {
      this.switchView(e.target.value);
    });

    // Search
    document.getElementById('search').addEventListener('input', (e) => {
      this.filterData();
    });

    // Category filter
    document.getElementById('category-filter').addEventListener('change', () => {
      this.filterData();
    });

    // Chain filter
    document.getElementById('chain-filter').addEventListener('change', () => {
      this.filterData();
    });

    // TVL filter
    document.getElementById('tvl-filter').addEventListener('change', () => {
      this.filterData();
    });

    // Compare selectors
    document.getElementById('compare-protocol-1').addEventListener('change', (e) => {
      this.compareProtocol1 = e.target.value;
      this.updateCompare();
    });

    document.getElementById('compare-protocol-2').addEventListener('change', (e) => {
      this.compareProtocol2 = e.target.value;
      this.updateCompare();
    });
  }

  switchView(view) {
    this.currentView = view;
    
    // Hide all containers
    document.getElementById('board-container').style.display = 'none';
    document.getElementById('live-container').style.display = 'none';
    document.getElementById('compare-container').style.display = 'none';
    document.getElementById('detail-container').style.display = 'none';

    // Show selected container
    switch(view) {
      case 'board':
        document.getElementById('board-container').style.display = 'block';
        this.renderBoard();
        break;
      case 'live':
        document.getElementById('live-container').style.display = 'block';
        this.renderLive();
        break;
      case 'compare':
        document.getElementById('compare-container').style.display = 'block';
        this.populateCompareSelects();
        this.updateCompare();
        break;
    }
  }

  render() {
    this.renderBoard();
    this.renderStats();
  }

  renderStats() {
    document.getElementById('watchlist-count').textContent = 
      `${this.data.watchlist_size} watchlist protocols`;
    document.getElementById('board-count').textContent = 
      `${this.data.board_size} total protocols`;
    document.getElementById('model-info').textContent = 
      `Model: ${this.data.model_version} (momentum-based)`;
  }

  renderBoard() {
    const boardList = document.getElementById('board-list');
    boardList.innerHTML = '';

    this.filteredData.forEach(protocol => {
      const boardItem = this.createBoardItem(protocol);
      boardList.appendChild(boardItem);
    });
  }

  createBoardItem(protocol) {
    const item = document.createElement('div');
    item.className = 'board-item';
    item.onclick = () => this.showDetail(protocol);

    const riskClass = protocol.risk_score < 33 ? 'risk-low' : 
                     protocol.risk_score < 66 ? 'risk-medium' : 'risk-high';

    item.innerHTML = `
      <div class="board-item-header">
        <div class="board-item-rank">#${protocol.rank}</div>
        <div class="board-item-info">
          <div class="board-item-name">${protocol.name}</div>
          <div class="board-item-meta">
            <span>${protocol.category || 'No Category'}</span>
            <span>•</span>
            <span>${protocol.chains.join(', ')}</span>
            <span>•</span>
            <span>${this.formatDate(protocol.listed_at)}</span>
          </div>
        </div>
      </div>
      
      <div class="board-item-stats">
        <div class="stat-item">
          <div class="stat-label">TVL</div>
          <div class="stat-value">${this.formatUSD(protocol.tvl_usd)}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Implied Value</div>
          <div class="stat-value implied-value">${this.formatUSD(protocol.implied_value_usd)}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">7D Change</div>
          <div class="stat-value">${this.formatChange(protocol.change_7d)}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Risk Score</div>
          <div class="stat-value risk-score ${riskClass}">${protocol.risk_score}/100</div>
        </div>
      </div>
      
      <div class="board-item-farm">
        <div class="farm-title">Farm Plan</div>
        <ul class="farm-steps">
          ${protocol.farm_steps.slice(0, 3).map(step => 
            `<li class="farm-step"><strong>Step ${protocol.farm_steps.indexOf(step) + 1}:</strong> ${step}</li>`
          ).join('')}
          ${protocol.farm_steps.length > 3 ? 
            `<li class="farm-step"><strong>View all ${protocol.farm_steps.length} steps →</strong></li>` : ''}
        </ul>
      </div>
    `;

    return item;
  }

  renderLive() {
    const liveList = document.getElementById('live-list');
    liveList.innerHTML = '';

    this.data.live.forEach(protocol => {
      const liveItem = document.createElement('div');
      liveItem.className = 'live-item';
      
      liveItem.innerHTML = `
        <div class="live-item-info">
          <div class="live-item-name">${protocol.name}</div>
          <div class="live-item-meta">
            <span>${protocol.category || 'No Category'}</span>
            <span>•</span>
            <span>${protocol.chains.join(', ')}</span>
          </div>
        </div>
        <div class="live-item-stats">
          <div class="stat-item">
            <div class="stat-label">Market Cap</div>
            <div class="stat-value">${this.formatUSD(protocol.mcap_usd)}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">TVL</div>
            <div class="stat-value">${this.formatUSD(protocol.tvl_usd)}</div>
          </div>
        </div>
      `;
      
      liveList.appendChild(liveItem);
    });
  }

  showDetail(protocol) {
    this.selectedProtocol = protocol;
    document.getElementById('board-container').style.display = 'none';
    document.getElementById('detail-container').style.display = 'block';

    const detailContent = document.getElementById('detail-content');
    const riskClass = protocol.risk_score < 33 ? 'risk-low' : 
                     protocol.risk_score < 66 ? 'risk-medium' : 'risk-high';

    detailContent.innerHTML = `
      <div class="detail-section">
        <h3>Protocol Overview</h3>
        <div class="board-item-header">
          <div class="board-item-rank">#${protocol.rank}</div>
          <div class="board-item-info">
            <div class="board-item-name">${protocol.name}</div>
            <div class="board-item-meta">
              <span>${protocol.category || 'No Category'}</span>
              <span>•</span>
              <span>${protocol.chains.join(', ')}</span>
              <span>•</span>
              <span>${this.formatDate(protocol.listed_at)}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="detail-section">
        <h3>Valuation Model</h3>
        <div class="board-item-stats">
          <div class="stat-item">
            <div class="stat-label">Base Value (TVL × 0.20)</div>
            <div class="stat-value">${this.formatUSD(protocol.tvl_usd * 0.20)}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Growth Multiplier</div>
            <div class="stat-value">${protocol.model.growth_multiplier.toFixed(2)}x</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Maturity Multiplier</div>
            <div class="stat-value">${protocol.model.maturity_multiplier.toFixed(2)}x</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Chain Diversity</div>
            <div class="stat-value">${protocol.model.chain_diversity_multiplier.toFixed(2)}x</div>
          </div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Final Implied Value</div>
          <div class="stat-value implied-value">${this.formatUSD(protocol.implied_value_usd)}</div>
        </div>
      </div>

      <div class="detail-section">
        <h3>Risk Assessment</h3>
        <div class="board-item-stats">
          <div class="stat-item">
            <div class="stat-label">Age</div>
            <div class="stat-value">${protocol.age_days ? `${protocol.age_days} days` : 'Unknown'}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">7D Growth</div>
            <div class="stat-value">${this.formatChange(protocol.change_7d)}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Chain Count</div>
            <div class="stat-value">${protocol.chains.length}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Risk Score</div>
            <div class="stat-value risk-score ${riskClass}">${protocol.risk_score}/100</div>
          </div>
        </div>
      </div>

      <div class="detail-section">
        <h3>Complete Farm Plan</h3>
        <ul class="farm-steps">
          ${protocol.farm_steps.map((step, index) => 
            `<li class="farm-step"><strong>Step ${index + 1}:</strong> ${step}</li>`
          ).join('')}
        </ul>
      </div>
    `;
  }

  showBoard() {
    document.getElementById('detail-container').style.display = 'none';
    document.getElementById('board-container').style.display = 'block';
  }

  populateFilters() {
    const categories = [...new Set(this.data.rows.map(p => p.category).filter(c => c))];
    const chains = [...new Set(this.data.rows.flatMap(p => p.chains))];

    const categoryFilter = document.getElementById('category-filter');
    const chainFilter = document.getElementById('chain-filter');

    // Clear existing options
    categoryFilter.innerHTML = '<option value="">All Categories</option>';
    chainFilter.innerHTML = '<option value="">All Chains</option>';

    // Add category options
    categories.forEach(category => {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category;
      categoryFilter.appendChild(option);
    });

    // Add chain options
    chains.forEach(chain => {
      const option = document.createElement('option');
      option.value = chain;
      option.textContent = chain;
      chainFilter.appendChild(option);
    });
  }

  populateCompareSelects() {
    const select1 = document.getElementById('compare-protocol-1');
    const select2 = document.getElementById('compare-protocol-2');

    // Clear existing options
    select1.innerHTML = '<option value="">Select first protocol</option>';
    select2.innerHTML = '<option value="">Select second protocol</option>';

    // Add protocol options
    this.data.rows.forEach(protocol => {
      const option1 = document.createElement('option');
      option1.value = protocol.slug;
      option1.textContent = `${protocol.name} (#${protocol.rank})`;
      select1.appendChild(option1);

      const option2 = document.createElement('option');
      option2.value = protocol.slug;
      option2.textContent = `${protocol.name} (#${protocol.rank})`;
      select2.appendChild(option2);
    });
  }

  filterData() {
    const searchTerm = document.getElementById('search').value.toLowerCase();
    const categoryFilter = document.getElementById('category-filter').value;
    const chainFilter = document.getElementById('chain-filter').value;
    const tvlFilter = document.getElementById('tvl-filter').value;

    this.filteredData = this.data.rows.filter(protocol => {
      // Search filter
      if (searchTerm && !protocol.name.toLowerCase().includes(searchTerm) && 
          !protocol.slug.toLowerCase().includes(searchTerm)) {
        return false;
      }

      // Category filter
      if (categoryFilter && protocol.category !== categoryFilter) {
        return false;
      }

      // Chain filter
      if (chainFilter && !protocol.chains.includes(chainFilter)) {
        return false;
      }

      // TVL filter
      if (tvlFilter) {
        const tvl = protocol.tvl_usd;
        switch (tvlFilter) {
          case '100M':
            if (tvl < 100_000_000) return false;
            break;
          case '1B':
            if (tvl < 1_000_000_000) return false;
            break;
          case '5B':
            if (tvl < 5_000_000_000) return false;
            break;
        }
      }

      return true;
    });

    if (this.currentView === 'board') {
      this.renderBoard();
    }
  }

  updateCompare() {
    const results = document.getElementById('compare-results');
    
    if (!this.compareProtocol1 || !this.compareProtocol2) {
      results.innerHTML = '<p>Select two protocols to compare</p>';
      return;
    }

    const protocol1 = this.data.rows.find(p => p.slug === this.compareProtocol1);
    const protocol2 = this.data.rows.find(p => p.slug === this.compareProtocol2);

    if (!protocol1 || !protocol2) {
      results.innerHTML = '<p>One or both protocols not found</p>';
      return;
    }

    results.innerHTML = `
      <div class="compare-protocol">
        <h3>${protocol1.name} (#${protocol1.rank})</h3>
        <table class="compare-table">
          <tr><th>TVL</th><td>${this.formatUSD(protocol1.tvl_usd)}</td></tr>
          <tr><th>Implied Value</th><td>${this.formatUSD(protocol1.implied_value_usd)}</td></tr>
          <tr><th>Risk Score</th><td>${protocol1.risk_score}/100</td></tr>
          <tr><th>Age</th><td>${protocol1.age_days ? `${protocol1.age_days} days` : 'Unknown'}</td></tr>
          <tr><th>Chains</th><td>${protocol1.chains.join(', ')}</td></tr>
          <tr><th>Growth Multiplier</th><td>${protocol1.model.growth_multiplier.toFixed(2)}x</td></tr>
          <tr><th>Maturity Multiplier</th><td>${protocol1.model.maturity_multiplier.toFixed(2)}x</td></tr>
        </table>
      </div>
      
      <div class="compare-protocol">
        <h3>${protocol2.name} (#${protocol2.rank})</h3>
        <table class="compare-table">
          <tr><th>TVL</th><td>${this.formatUSD(protocol2.tvl_usd)}</td></tr>
          <tr><th>Implied Value</th><td>${this.formatUSD(protocol2.implied_value_usd)}</td></tr>
          <tr><th>Risk Score</th><td>${protocol2.risk_score}/100</td></tr>
          <tr><th>Age</th><td>${protocol2.age_days ? `${protocol2.age_days} days` : 'Unknown'}</td></tr>
          <tr><th>Chains</th><td>${protocol2.chains.join(', ')}</td></tr>
          <tr><th>Growth Multiplier</th><td>${protocol2.model.growth_multiplier.toFixed(2)}x</td></tr>
          <tr><th>Maturity Multiplier</th><td>${protocol2.model.maturity_multiplier.toFixed(2)}x</td></tr>
        </table>
      </div>
    `;
  }

  // Utility methods
  formatUSD(amount) {
    if (amount === null || amount === undefined) return 'N/A';
    if (amount >= 1_000_000_000) {
      return `$${(amount / 1_000_000_000).toFixed(2)}B`;
    } else if (amount >= 1_000_000) {
      return `$${(amount / 1_000_000).toFixed(2)}M`;
    } else if (amount >= 1_000) {
      return `$${(amount / 1_000).toFixed(1)}K`;
    }
    return `$${amount.toFixed(0)}`;
  }

  formatDate(dateString) {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  formatChange(change) {
    if (change === null || change === undefined) return 'N/A';
    const prefix = change >= 0 ? '+' : '';
    return `${prefix}${change.toFixed(2)}%`;
  }
}

// Initialize the dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const radar = new TokenRadar();
  window.showBoard = () => radar.showBoard();
});