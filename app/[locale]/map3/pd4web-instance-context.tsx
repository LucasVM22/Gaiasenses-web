"use client";

import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from "react";

type Pd4WebInstance = typeof Pd4Web;

type Pd4WebInstanceContextValue = {
  pdRef: MutableRefObject<Pd4WebInstance | null>;
  setPdInstance: (pd: Pd4WebInstance | null) => void;
};

const Pd4WebInstanceContext = createContext<Pd4WebInstanceContextValue | null>(
  null,
);

export function Pd4WebInstanceProvider({ children }: { children: ReactNode }) {
  const pdRef = useRef<Pd4WebInstance | null>(null);

  const value = useMemo<Pd4WebInstanceContextValue>(
    () => ({
      pdRef,
      setPdInstance: (pd: Pd4WebInstance | null) => {
        pdRef.current = pd;
      },
    }),
    [],
  );

  return (
    <Pd4WebInstanceContext.Provider value={value}>
      {children}
    </Pd4WebInstanceContext.Provider>
  );
}

export function usePd4WebInstance() {
  const context = useContext(Pd4WebInstanceContext);
  if (!context) {
    throw new Error(
      "usePd4WebInstance must be used inside Pd4WebInstanceProvider",
    );
  }

  return context;
}
