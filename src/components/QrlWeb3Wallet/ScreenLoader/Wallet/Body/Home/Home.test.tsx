import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Home from "./Home";

vi.mock("lucide-react", async () => {
  const originalModule =
    await vi.importActual<typeof import("lucide-react")>("lucide-react");
  return {
    ...originalModule,
    Loader: () => <div>Mocked Loader</div>,
  };
});
vi.mock(
  "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/Home/AccountCreateImport/AccountCreateImport",
  () => ({ default: () => <div>Mocked Account Create Import</div> }),
);

describe("Home", () => {
  afterEach(cleanup);

  const renderComponent = (mockedStoreValues = mockedStore()) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <Home />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render the loader component if the connection is loading", () => {
    renderComponent(
      mockedStore({ qrlStore: { qrlConnection: { isLoading: true } } }),
    );

    expect(screen.getByText("Mocked Loader")).toBeInTheDocument();
  });

  it("should render the account create import component if connected to the blockchain", async () => {
    renderComponent();

    await waitFor(() => {
      expect(
        screen.getByText("Mocked Account Create Import"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Mocked Connection Failed"),
      ).not.toBeInTheDocument();
    });
  });

  it("should warn when the node only supports legacy 20-byte addresses", () => {
    renderComponent(
      mockedStore({
        qrlStore: { qrlConnection: { hasLegacyAddressFormat: true } },
      }),
    );

    expect(screen.getByText("Unsupported network")).toBeInTheDocument();
    expect(
      screen.getByText(/still uses the old 20-byte QRL addresses/),
    ).toBeInTheDocument();
    expect(screen.getByText("Mocked Account Create Import")).toBeInTheDocument();
  });

  it("should not warn on networks using 64-byte addresses", () => {
    renderComponent();

    expect(screen.queryByText("Unsupported network")).not.toBeInTheDocument();
  });
});
