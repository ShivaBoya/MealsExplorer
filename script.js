    const API = 'https://www.themealdb.com/api/json/v1/1/';

    // --- Utilities ---
    const debounce = (fn, wait = 300) => {
      let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
    };
    const throttle = (fn, wait = 600) => {
      let inFlight = false; return (...args) => { if (inFlight) return; inFlight = true; try { fn(...args); } finally { setTimeout(() => inFlight = false, wait); } };
    };

    const els = {
      search: document.getElementById('search'),
      suggestions: document.getElementById('suggestions'),
      category: document.getElementById('category'),
      sort: document.getElementById('sort'),
      results: document.getElementById('results'),
      pagination: document.getElementById('pagination'),
      pageInfo: document.getElementById('pageInfo'),
      count: document.getElementById('count'),
      activeFilters: document.getElementById('activeFilters'),
      loader: document.getElementById('loader'),
    };

    const state = {
      searchTerm: '',
      category: '',
      sort: 'name-asc',
      page: 1,
      pageSize: 9,
      meals: [],
      total: 0,
    };

    const showLoader = (show = true) => {
      els.loader.classList.toggle('show', show);
      els.loader.setAttribute('aria-hidden', show ? 'false' : 'true');
    };

    // --- API calls ---
    async function fetchCategories() {
      const res = await fetch(API + 'list.php?c=list');
      const data = await res.json();
      return (data.categories || data.meals || []).map(c => c.strCategory);
    }

    async function fetchBySearch(term) {
      const res = await fetch(API + 'search.php?s=' + encodeURIComponent(term));
      const data = await res.json();
      return data.meals || [];
    }

    async function fetchByCategory(cat) {
      const res = await fetch(API + 'filter.php?c=' + encodeURIComponent(cat));
      const data = await res.json();
      // filter endpoint returns limited fields; annotate category for UI consistency
      const meals = (data.meals || []).map(m => ({
        idMeal: m.idMeal,
        strMeal: m.strMeal,
        strMealThumb: m.strMealThumb,
        strCategory: cat,
      }));
      return meals;
    }

    async function fetchLookup(id) {
      const res = await fetch(API + 'lookup.php?i=' + encodeURIComponent(id));
      const data = await res.json();
      return (data.meals && data.meals[0]) || null;
    }

    // --- Rendering ---
    function renderMeals() {
      const { page, pageSize, meals } = state;
      const start = (page - 1) * pageSize;
      const pageMeals = meals.slice(start, start + pageSize);

      els.results.innerHTML = '';
      if (!pageMeals.length) {
        els.results.innerHTML = `<div class="empty" style="grid-column: 1/-1">No meals found. Try a different search or category.</div>`;
      } else {
        for (const m of pageMeals) {
          const card = document.createElement('article');
          card.className = 'card';
          card.innerHTML = `
            <div class="thumb">
              <img src="${m.strMealThumb}" alt="${m.strMeal}" loading="lazy" />
              ${m.strCategory ? `<span class="badge">${m.strCategory}</span>` : ''}
            </div>
            <div class="body">
              <h3 class="title">${m.strMeal}</h3>
              ${m.strArea ? `<p class="sub">${m.strArea}</p>` : ''}
            </div>
          `;
          els.results.appendChild(card);
        }
      }

      els.count.textContent = `${state.total} result${state.total === 1 ? '' : 's'}`;
      const active = [];
      if (state.searchTerm) active.push(`search: "${state.searchTerm}"`);
      if (state.category) active.push(`category: ${state.category}`);
      els.activeFilters.style.display = active.length ? 'inline-block' : 'none';
      els.activeFilters.textContent = active.join(' • ');

      renderPagination();
    }

    function renderPagination() {
      const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
      state.page = Math.min(state.page, totalPages);

      els.pagination.innerHTML = '';

      const makeBtn = (label, onClick, disabled = false) => {
        const b = document.createElement('button');
        b.textContent = label; b.disabled = disabled; b.addEventListener('click', throttle(onClick, 600));
        return b;
      };

      els.pagination.appendChild(makeBtn('⟨ Prev', () => changePage(state.page - 1), state.page === 1));

      // show up to 5 page buttons centered around current
      const totalPagesToShow = 5;
      let start = Math.max(1, state.page - Math.floor(totalPagesToShow/2));
      let end = Math.min(totalPages, start + totalPagesToShow - 1);
      start = Math.max(1, end - totalPagesToShow + 1);

      for (let p = start; p <= end; p++) {
        const btn = makeBtn(String(p), () => changePage(p));
        if (p === state.page) btn.style.outline = `2px solid var(--accent)`;
        els.pagination.appendChild(btn);
      }

      els.pagination.appendChild(makeBtn('Next ⟩', () => changePage(state.page + 1), state.page === totalPages));
      els.pageInfo.textContent = `Page ${state.page} / ${totalPages}`;
    }

    function changePage(p) {
      const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
      state.page = Math.min(Math.max(1, p), totalPages);
      renderMeals();
    }

    // --- Search + suggestions ---
    const handleSearchInput = debounce(async () => {
      const term = els.search.value.trim();
      state.searchTerm = term;
      state.page = 1;

      if (!term) {
        els.suggestions.classList.remove('show');
        await loadData();
        return;
      }

      // Fetch suggestions
      try {
        const list = await fetchBySearch(term);
        const names = list.map(m => ({ id: m.idMeal, name: m.strMeal })).slice(0, 8);
        els.suggestions.innerHTML = names.map(n => `<button role="option" data-id="${n.id}">${n.name}</button>`).join('');
        els.suggestions.classList.toggle('show', names.length > 0);
      } catch(e) { console.error(e); }

      await loadData();
    }, 500);

    els.suggestions.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-id]');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      showLoader(true);
      try {
        const item = await fetchLookup(id);
        state.meals = item ? [item] : [];
        state.total = state.meals.length;
        state.page = 1;
        els.search.value = item ? item.strMeal : els.search.value;
        els.suggestions.classList.remove('show');
        renderMeals();
      } catch (e) { console.error(e); }
      finally { showLoader(false); }
    });

    // --- Orchestrate data fetching ---
    async function loadData() {
      showLoader(true);
      try {
        let list = [];
        if (state.searchTerm) {
          list = await fetchBySearch(state.searchTerm);
          // If category selected simultaneously, filter client-side (search has category info)
          if (state.category) {
            list = list.filter(m => m.strCategory === state.category);
          }
        } else if (state.category) {
          list = await fetchByCategory(state.category);
        } else {
          // default: show something pleasant (popular keyword)
          list = await fetchBySearch('chicken');
        }

        // sort
        list.sort((a,b) => {
          const A = (a.strMeal || '').toLowerCase();
          const B = (b.strMeal || '').toLowerCase();
          if (state.sort === 'name-asc') return A.localeCompare(B);
          if (state.sort === 'name-desc') return B.localeCompare(A);
          return 0;
        });

        state.meals = list;
        state.total = list.length;
        state.page = 1; // reset when data set changes
        renderMeals();
      } catch (e) {
        console.error(e);
        els.results.innerHTML = `<div class="empty" style="grid-column: 1/-1">Failed to load meals. Please try again.</div>`;
        els.pagination.innerHTML = '';
        els.pageInfo.textContent = '';
        els.count.textContent = '0 results';
      } finally {
        showLoader(false);
      }
    }

    // --- Wire up controls ---
    els.search.addEventListener('input', handleSearchInput);
    document.addEventListener('click', (e) => {
      if (!els.suggestions.contains(e.target) && e.target !== els.search) {
        els.suggestions.classList.remove('show');
      }
    });

    els.category.addEventListener('change', () => { state.category = els.category.value; state.page = 1; loadData(); });
    els.sort.addEventListener('change', () => { state.sort = els.sort.value; state.page = 1; renderMeals(); });

    // --- Init ---
    (async function init(){
      showLoader(true);
      try {
        // categories
        const cats = await fetchCategories();
        els.category.insertAdjacentHTML('beforeend', cats.map(c => `<option value="${c}">${c}</option>`).join(''));
      } catch(e){ console.error(e); }
      finally {
        await loadData();
      }
    })();
