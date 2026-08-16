import { useEffect, useRef, useState } from "react";

export type MenuAction = {
  type: "action";
  label: string;
  disabled?: boolean;
  checked?: boolean;
  onClick: () => void;
};
export type MenuSeparator = { type: "separator" };
export type MenuItem = MenuAction | MenuSeparator;
export type MenuDef = { label: string; items: MenuItem[] };

export function MenuBar({ menus }: { menus: MenuDef[] }) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: globalThis.MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as globalThis.Node)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, []);

  return (
    <nav className="menubar" ref={barRef}>
      {menus.map((menu) => {
        const open = openMenu === menu.label;
        return (
          <div key={menu.label} className="menu-root">
            <button
              className={open ? "menu-title active" : "menu-title"}
              onClick={() => setOpenMenu(open ? null : menu.label)}
            >
              {menu.label}
            </button>
            {open && (
              <div className="menu-dropdown">
                {menu.items.map((item, i) =>
                  item.type === "separator" ? (
                    <div key={i} className="menu-separator" />
                  ) : (
                    <button
                      key={i}
                      className="menu-item"
                      disabled={item.disabled}
                      onClick={() => {
                        item.onClick();
                        setOpenMenu(null);
                      }}
                    >
                      <span>{item.label}</span>
                      {item.checked && <span className="menu-check">✓</span>}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
