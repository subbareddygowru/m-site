document.addEventListener("DOMContentLoaded", function ()
{

    // Load Header
    fetch("/includes/header.html")
        .then(response => response.text())
        .then(data =>
        {

            document.getElementById("header").innerHTML = data;

            // Mobile Menu
            const menu = document.getElementById("menu-toggle");
            const close = document.getElementById("close-menu");
            const nav = document.getElementById("nav-links");
            const backdrop = document.getElementById("nav-backdrop");
            const allDropdowns = nav ? nav.querySelectorAll(".dropdown") : [];
            const allToggles = nav ? nav.querySelectorAll(".dropdown-toggle") : [];

            const isMobile = () => window.matchMedia("(max-width: 768px)").matches;

            // Collapse a dropdown and, recursively, any of its open
            // descendants (so a submenu doesn't stay open next time
            // its parent is reopened)
            const collapseDropdown = (drop) =>
            {
                drop.classList.remove("open");
                const btn = drop.querySelector(":scope > .dropdown-toggle");
                if (btn) btn.setAttribute("aria-expanded", "false");
                drop.querySelectorAll(":scope .dropdown.open").forEach(collapseDropdown);
            };

            const closeAllDropdowns = () =>
            {
                allDropdowns.forEach(drop =>
                {
                    // Only collapse top-level dropdowns; collapseDropdown
                    // recurses into their children itself
                    if (drop.parentElement === nav) collapseDropdown(drop);
                });
            };

            const openMenu = () =>
            {
                nav.classList.add("active");
                if (backdrop) backdrop.classList.add("active");
            };

            const closeMenu = () =>
            {
                nav.classList.remove("active");
                if (backdrop) backdrop.classList.remove("active");
                closeAllDropdowns();
            };

            if (menu && nav)
            {
                menu.addEventListener("click", openMenu);
            }

            if (close && nav)
            {
                close.addEventListener("click", closeMenu);
            }

            if (backdrop)
            {
                backdrop.addEventListener("click", closeMenu);
            }

            // Dropdown open/close: click-to-toggle on mobile at every
            // nesting level (touch has no real :hover). Opening a row
            // collapses its sibling rows at that same level only, so
            // parent/ancestor menus stay open. Desktop keeps :hover via CSS.
            allToggles.forEach(btn =>
            {
                const drop = btn.closest(".dropdown");
                if (!drop || btn !== drop.querySelector(":scope > .dropdown-toggle")) return;

                btn.addEventListener("click", (e) =>
                {
                    if (!isMobile()) return;

                    e.preventDefault();

                    const parent = drop.parentElement;
                    const siblings = parent.querySelectorAll(":scope > .dropdown");
                    const willOpen = !drop.classList.contains("open");

                    siblings.forEach(collapseDropdown);

                    if (willOpen)
                    {
                        drop.classList.add("open");
                        btn.setAttribute("aria-expanded", "true");
                    }
                });
            });

            // Tapping an actual playlist link should close the whole menu
            nav.querySelectorAll(".dropdown-content a").forEach(link =>
            {
                link.addEventListener("click", () =>
                {
                    if (isMobile()) closeMenu();
                });
            });

            // Reset mobile menu/dropdown state if the viewport is resized
            // past the mobile breakpoint (e.g. rotating a tablet)
            window.addEventListener("resize", () =>
            {
                if (!isMobile()) closeMenu();
            });

            // ---- Site search ----
            // The index is loaded from /search-index.json, which is a
            // generated snapshot of every real page on the site (not just
            // the ones linked in the header dropdowns). If that file can't
            // be loaded for some reason, we fall back to scraping the nav
            // links so search still works, just with less coverage.
            const searchToggle = document.getElementById("search-toggle");
            const searchPanel = document.getElementById("search-panel");
            const searchClose = document.getElementById("search-close");
            const searchInput = document.getElementById("site-search-input");
            const searchResults = document.getElementById("search-results");

            const escapeHtml = (str) => String(str).replace(/[&<>"']/g, (ch) => ({
                "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
            }[ch]));

            const buildNavSearchIndex = () =>
            {
                if (!nav) return [];

                return Array.from(nav.querySelectorAll(".dropdown-content a")).map(link =>
                {
                    const categoryBtn = link.closest(".submenu")?.querySelector(":scope > .dropdown-toggle");
                    const languageBtn = link.closest(".lang-dropdown")?.querySelector(":scope > .dropdown-toggle");

                    const clean = (text) => (text || "").replace(/\s+/g, " ").trim();

                    return {
                        name: clean(link.textContent),
                        href: link.getAttribute("href"),
                        external: link.getAttribute("target") === "_blank",
                        subtitle: [clean(languageBtn?.textContent), clean(categoryBtn?.textContent)]
                            .filter(Boolean).join(" \u00b7 ")
                    };
                });
            };

            let searchIndex = [];
            let searchIndexPromise = null;

            const loadSearchIndex = () =>
            {
                if (searchIndexPromise) return searchIndexPromise;

                searchIndexPromise = fetch("/search-index.json")
                    .then(res =>
                    {
                        if (!res.ok) throw new Error("search-index.json not found");
                        return res.json();
                    })
                    .then(siteWide =>
                    {
                        // Merge in nav links too (covers "View All →" links,
                        // external links, and anything not yet regenerated
                        // into search-index.json), de-duplicated by href.
                        const seen = new Set(siteWide.map(item => item.href));
                        const navExtras = buildNavSearchIndex().filter(item => !seen.has(item.href));
                        return siteWide.concat(navExtras);
                    })
                    .catch(() => buildNavSearchIndex());

                return searchIndexPromise;
            };

            const renderResults = (query) =>
            {
                const q = query.trim().toLowerCase();

                if (!q)
                {
                    searchResults.innerHTML = "";
                    return;
                }

                const matches = searchIndex
                    .filter(item => item.name.toLowerCase().includes(q) || item.subtitle.toLowerCase().includes(q))
                    .slice(0, 8);

                if (matches.length === 0)
                {
                    searchResults.innerHTML = `<p class="search-empty">No matches for "${escapeHtml(query)}"</p>`;
                    return;
                }

                searchResults.innerHTML = matches.map(item => `
                    <a class="search-result" href="${escapeHtml(item.href)}"${item.external ? ' target="_blank"' : ""}>
                        <span class="search-result-name">${escapeHtml(item.name)}</span>
                        ${item.subtitle ? `<span class="search-result-sub">${escapeHtml(item.subtitle)}</span>` : ""}
                    </a>
                `).join("");
            };

            const openSearch = () =>
            {
                if (!searchPanel) return;
                closeMenu();
                searchPanel.classList.add("active");
                if (searchToggle) searchToggle.setAttribute("aria-expanded", "true");
                setTimeout(() => searchInput && searchInput.focus(), 50);

                loadSearchIndex().then(index =>
                {
                    searchIndex = index;
                    if (searchInput && searchInput.value.trim())
                    {
                        renderResults(searchInput.value);
                    }
                });
            };

            const closeSearch = () =>
            {
                if (!searchPanel) return;
                searchPanel.classList.remove("active");
                if (searchToggle) searchToggle.setAttribute("aria-expanded", "false");
                if (searchInput) searchInput.value = "";
                if (searchResults) searchResults.innerHTML = "";
            };

            if (searchToggle && searchPanel)
            {
                searchToggle.addEventListener("click", () =>
                {
                    if (searchPanel.classList.contains("active")) closeSearch();
                    else openSearch();
                });
            }

            if (searchClose)
            {
                searchClose.addEventListener("click", closeSearch);
            }

            if (searchInput)
            {
                searchInput.addEventListener("input", (e) => renderResults(e.target.value));

                searchInput.addEventListener("keydown", (e) =>
                {
                    if (e.key === "Escape")
                    {
                        closeSearch();
                        searchToggle && searchToggle.focus();
                    }
                    else if (e.key === "Enter")
                    {
                        const first = searchResults.querySelector(".search-result");
                        if (first) first.click();
                    }
                });
            }

            // Also close search whenever the mobile hamburger menu is opened
            if (menu)
            {
                menu.addEventListener("click", closeSearch);
            }

            document.addEventListener("click", (e) =>
            {
                if (!searchPanel || !searchPanel.classList.contains("active")) return;
                const clickedToggle = searchToggle && (e.target === searchToggle || searchToggle.contains(e.target));
                if (!searchPanel.contains(e.target) && !clickedToggle) closeSearch();
            });

            document.addEventListener("keydown", (e) =>
            {
                if (e.key === "Escape" && searchPanel && searchPanel.classList.contains("active")) closeSearch();
            });

        });

    // Load Footer
    fetch("/includes/footer.html")
        .then(response => response.text())
        .then(data =>
        {
            document.getElementById("footer").innerHTML = data;
        });

    // Telugu Explore Section
    fetch("/includes/explore-telugu.html")
        .then(response => response.text())
        .then(data =>
        {
            const explore = document.getElementById("explore-telugu");
            if (explore) explore.innerHTML = data;
        });


});
