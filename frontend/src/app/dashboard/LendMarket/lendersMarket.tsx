"use client";
import { useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAccount, useContractWrite, useContractRead } from "@starknet-react/core";
import { Plus, X } from "lucide-react";
import Nav from "../../../components/custom/Nav";
import Sidebar from "../../../components/custom/sidebar";
import { PROTOCOL_ADDRESS } from "@/components/internal/helpers/constant";
import protocolAbi from "../../../../public/abi/protocol.json";
import { normalizeAddress, toHex } from "@/components/internal/helpers";
import { toast as toastify } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import NewProposalModal from "@/components/proposalModal";
import DepositTokenModal from "@/components/custom/DepositTokenModal";
import { CallData } from "starknet";
import { TokentoHex } from "../../../components/internal/helpers/index";
import FilterBar from "@/components/custom/FilterBar";

// Constants
const ITEMS_PER_PAGE = 7;
const TOKEN_ADDRESSES = {
  STRK: "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
};

// Types
type ModalType = "lend" | "counter" | "borrow";

interface PendingAction {
  callback: () => void;
}

// Component for the header section
const Header = () => (
  <div className="flex p-4">
    <div className="flex gap-3 justify-center items-center">
      <Link href="/dashboard">
        <Image
          src="/images/back-button.svg"
          height={40}
          width={40}
          alt="back-button"
          className="cursor-pointer"
        />
      </Link>
      <div className="flex gap-2 pb-2">
        <p className="text-black text-xl md:text-2xl lg:text-4xl">
          Lenders Market
        </p>
        <div className="flex gap-2 border rounded-3xl text-black border-gray-500 w-24 items-center justify-center">
          <Image
            src="/images/starknet.png"
            height={20}
            width={20}
            alt="starknet-logo"
          />
          <p className="text-xs">Starknet</p>
        </div>
      </div>
    </div>
  </div>
);

// Component for the table header
const TableHeader = () => (
  <div className="grid grid-cols-7 pt-6 rounded-t-xl bg-smoke-white py-4 min-w-[800px]">
    <div className="text-center font-semibold">Lender</div>
    <div className="text-center font-semibold">Token</div>
    <div className="text-center font-semibold">Quantity</div>
    <div className="text-center font-semibold">Net Value</div>
    <div className="text-center font-semibold">Interest Rate</div>
    <div className="text-center font-semibold">Duration</div>
    <div className="text-center font-semibold">Actions</div>
  </div>
);

interface TableRowProps {
  onCounter: (item: string) => void;
  onBorrowWithCheck: (
    proposalId: string,
    amount: string,
    action: (proposalId: bigint, amount: any) => void
  ) => void;
}

const TableRow = ({ onCounter, onBorrowWithCheck }: TableRowProps) => {
  const [loading, setLoading] = useState(false);
  const { address } = useAccount();

  const { data, isLoading: proposalsLoading } = useContractRead(
    address
      ? {
          abi: protocolAbi,
          address: PROTOCOL_ADDRESS,
          functionName: "get_lending_proposal_details",
          args: [],
          watch: true,
        }
      : ({} as any)
  );

  // Ensure data is an array
  const lendingProposals = Array.isArray(data) ? data : [];

  const { write: lend } = useContractWrite({
    calls: [
      {
        abi: protocolAbi,
        contractAddress: PROTOCOL_ADDRESS,
        entrypoint: "accept_proposal",
        calldata: [], // Will be set when calling
      },
    ],
  });

  const handleLend = async (proposalId: bigint, amount: any) => {
    setLoading(true);
    try {
      const transaction = await lend({
        calls: [
          {
            abi: protocolAbi,
            contractAddress: PROTOCOL_ADDRESS,
            entrypoint: "accept_proposal",
            calldata: CallData.compile([proposalId, "0"]),
          },
        ],
      });

      if (transaction?.transaction_hash) {
        // Add notification
        await fetch("/api/database/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_address: address,
            message: `Your lending proposal ${proposalId} has been accepted`,
          }),
        });

        toastify.success("Proposal Accepted");
        await transaction.wait();

        // Record transaction in DB
        await fetch("/api/database/protocol-data", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            total_borrow: 0,
            total_lend: amount,
            total_p2p_deals: 1,
            total_interest_earned: 0,
            total_value_locked: 0,
          }),
        });

        // Add notification
        await fetch("/api/database/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_address: address,
            message: `Your lending proposal ${proposalId} has been cancelled`,
          }),
        });

        console.log("Transaction completed!");
      }
    } catch (error) {
      console.error("Error accepting proposal:", error);
      toastify.error("Failed. Try again!");
    } finally {
      setLoading(false);
    }
  };

  const { write: cancel } = useContractWrite({
    calls: [
      {
        abi: protocolAbi,
        contractAddress: PROTOCOL_ADDRESS,
        entrypoint: "cancel_proposal",
        calldata: [],
      },
    ],
  });

  const cancelProposal = async (proposalId: any, amount: any) => {
    setLoading(true);
    try {
      const transaction = await cancel({
        calls: [
          {
            abi: protocolAbi,
            contractAddress: PROTOCOL_ADDRESS,
            entrypoint: "cancel_proposal",
            calldata: [proposalId, "0"],
          },
        ],
      });

      if (transaction?.transaction_hash) {
        console.log("Transaction submitted:", transaction.transaction_hash);

        toastify.success("Proposal Cancelled");
        await transaction.wait();

        // Record transaction in DB
        await fetch("/api/database/protocol-data", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            total_borrow: 0,
            total_lend: -amount,
            total_p2p_deals: -1,
            total_interest_earned: 0,
            total_value_locked: 0,
          }),
        });

        // Add notification
        await fetch("/api/database/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_address: address,
            message: `Your lending proposal ${proposalId} has been cancelled`,
          }),
        });

        console.log("Transaction completed!");
      }
    } catch (error) {
      console.error("Error cancelling proposal:", error);
      toastify.error("Failed. Try again");
    } finally {
      setLoading(false);
    }
  };

  const getTokenName = (tokenAddress: string): string => {
    const normalizedAddress = tokenAddress.toLowerCase();
    for (const [name, addr] of Object.entries(TOKEN_ADDRESSES)) {
      if (addr.toLowerCase() === normalizedAddress) {
        return name;
      }
    }
    return "Unknown";
  };

  return (
    <div className="border-t border-gray-300 min-w-[800px] w-full">
      {lendingProposals
        .filter(
          (item: any) =>
            item.is_cancelled !== true && item.is_accepted !== true
        )
        .map((item: any, index: number) => {
          const tokenHex = toHex(item.token.toString());
          let lenderHex = toHex(item.lender.toString());

          if (item.lender == address) {
            lenderHex = "Me";
          }

          return (
            <div key={index} className="grid grid-cols-7">
              {/* Merchant Column */}
              <div className="flex items-center justify-center px-4 py-6">
                <Image
                  src="/images/phantom-icon.svg"
                  height={20}
                  width={20}
                  alt="phantomicon"
                  className="h-5 w-5"
                />
                <p className="font-medium ml-2">{`${lenderHex.slice(
                  0,
                  5
                )}..`}</p>
              </div>

              {/* Token Column */}
              <div className="text-center px-4 py-6">
                <p className="font-medium">{getTokenName(tokenHex)}</p>
              </div>

              {/* Quantity Column */}
              <div className="text-center px-4 py-6">
                <p className="font-medium">
                  {Number(item.token_amount / BigInt(10 ** 18)).toFixed(2)}
                </p>
              </div>

              {/* Net Value Column */}
              <div className="text-center px-4 py-6">
                <p className="font-medium">$ {item.amount.toString()}</p>
              </div>

              {/* Interest Rate Column */}
              <div className="text-center px-4 py-6">
                <p className="font-medium">
                  {item.interest_rate.toString()}%
                </p>
              </div>

              {/* Duration Column */}
              <div className="text-center px-4 py-6">
                <p className="font-medium">
                  {item.duration.toString()} days
                </p>
              </div>

              {/* Actions Column */}
              <div className="flex gap-4 justify-center items-center py-6">
                <button
                  className={`px-4 py-2 text-sm rounded-full text-white ${
                    loading || proposalsLoading
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-black hover:bg-opacity-90 transition"
                  }`}
                  onClick={() => {
                    console.log("item id", item.id);
                    onBorrowWithCheck(
                      item.id.toString(),
                      item.amount.toString(),
                      handleLend
                    );
                  }}
                  disabled={loading || proposalsLoading}
                >
                  {loading ? "..." : "Borrow"}
                </button>

                <button
                  className={`px-3 py-2 text-sm rounded-full border border-black text-black bg-white hover:bg-gray-100 transition ${
                    loading || proposalsLoading
                      ? "opacity-50 cursor-not-allowed"
                      : ""
                  }`}
                  onClick={() =>
                    !loading &&
                    !proposalsLoading &&
                    onCounter(item.id.toString())
                  }
                  disabled={loading || proposalsLoading}
                >
                  Counter
                </button>

                {TokentoHex(item.lender.toString()) === normalizeAddress(address) && (
                  <X onClick={() => cancelProposal(item.id.toString(), item.amount.toString())} />
                )}
              </div>
            </div>
        );
      })}
    </div>
  );
};

// Main Lender Component
const Lender = () => {
  const [currentPage, setCurrentPage] = useState(1);
  const [isModalOpen, setModalOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [selectedProposalId, setSelectedProposalId] = useState<string>("");
  const [modalType, setModalType] = useState<"lend" | "counter" | "borrow">("borrow");
  const [title, setTitle] = useState("Create a Borrow Proposal");
  const [isDepositModalOpen, setDepositModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const { address } = useAccount();

  // Filter states
  const [filterOption, setFilterOption] = useState("token");
  const [filterValue, setFilterValue] = useState("");

  const totalPages = Math.ceil(5 / ITEMS_PER_PAGE);

  const { data, isLoading: proposalsLoading } = useContractRead(
    address
    ? {
        abi: protocolAbi,
        address: PROTOCOL_ADDRESS,
        functionName: "get_lending_proposal_details",
        args: [],
        watch: true,
      }
    : ({} as any)
  );

  const { data: lockedFunds } = useContractRead(
    address
      ? {
          abi: protocolAbi,
          address: PROTOCOL_ADDRESS,
          functionName: "get_locked_funds",
          args: [address, TOKEN_ADDRESSES.STRK],
          watch: true,
        }
      : ({} as any)
  );

  // Ensure proposals is an array
  const lendingProposals = Array.isArray(data) ? data : [];

  // Filter proposals (only non-cancelled and non-accepted)
  const validProposals = useMemo(() => {
    return lendingProposals.filter(
      (item: any) => item.is_cancelled !== true && item.is_accepted !== true
    );
  }, [lendingProposals]);

  // Utility to convert token field to token name
  const getTokenName = (tokenAddress: string): string => {
    const normalizedAddress = tokenAddress.toLowerCase();
    for (const [name, addr] of Object.entries(TOKEN_ADDRESSES)) {
      if (addr.toLowerCase() === normalizedAddress) {
        return name;
      }
    }
    return "Unknown";
  };

  // Filter valid proposals based on filterOption and filterValue
  const filteredProposals = useMemo(() => {
    if (!filterValue) return validProposals;
    return validProposals.filter((item: any) => {
      const itemTokenSymbol = getTokenName(toHex(item.token.toString()));
      const itemAmount = parseFloat(item.amount.toString());
      const itemInterest = parseFloat(item.interest_rate.toString());
      const itemDuration = parseFloat(item.duration.toString());

      switch (filterOption) {
        case "token":
          return itemTokenSymbol.toLowerCase() === filterValue.toLowerCase();
        case "amount": {
          const userAmount = parseFloat(filterValue);
          if (isNaN(userAmount)) return false;
          return itemAmount === userAmount;
        }
        case "interestRate": {
          const userInterest = parseFloat(filterValue);
          if (isNaN(userInterest)) return false;
          return itemInterest === userInterest;
        }
        case "duration": {
          const userDuration = parseFloat(filterValue);
          if (isNaN(userDuration)) return false;
          return itemDuration === userDuration;
        }
        default:
          return true;
      }
    });
  }, [validProposals, filterOption, filterValue]);

  const handleOpenModal = (type: "lend" | "counter" | "borrow", proposalId?: string) => {
  const checkBalanceAndProceed = (actionCallback: () => void) => {
    if (!lockedFunds || lockedFunds.toString() === "0") {
      setPendingAction({ callback: actionCallback });
      setDepositModalOpen(true);
    } else {
      actionCallback();
    }
  };

  const handleDepositSuccess = () => {
    setDepositModalOpen(false);
    if (pendingAction) {
      pendingAction.callback();
      setPendingAction(null);
    }
  };

  const handlePageChange = (page: number) => setCurrentPage(page);

  const openModal = (type: ModalType, proposalId?: string) => {
    setModalType(type);
    if (proposalId) {
      setSelectedProposalId(proposalId);
    }
    if (type === "counter") {
      setTitle("Counter this Proposal");
    }
    setModalOpen(true);
    if (type === "counter") {
      // change title if needed
    }
  };

  const handleOpenModal = (type: ModalType, proposalId?: string) => {
    // Wrap modal open in balance check
    checkBalanceAndProceed(() => {
      openModal(type, proposalId);
    });
  };

  return (
    <main className="bg-[#F5F5F5] backdrop-blur-sm">
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col h-full max-h-screen overflow-auto">
          <Nav />
          <Header />

          {/* Single-Filter Bar */}
          <div className="mx-4 mb-4">
            <FilterBar
              filterOption={filterOption}
              filterValue={filterValue}
              onOptionChange={(opt) => setFilterOption(opt)}
              onValueChange={(val) => setFilterValue(val)}
            />
          </div>

          {/* Table */}
          <div className="overflow-x-auto text-black border mx-4 mb-4 rounded-xl">
            <TableHeader />
            <div className="w-full">
              <TableRow
              proposals={filteredProposals}
                onCounter={(proposalId) => handleOpenModal("counter", proposalId)}
                onBorrowWithCheck={(proposalId, amount, action) =>
                  checkBalanceAndProceed(() =>
                    action(BigInt(proposalId), amount)
                  )
                }
              />
            </div>
          </div>

          <button
            onClick={() => checkBalanceAndProceed(() => handleOpenModal("borrow"))}
            className="relative flex items-center gap-2 px-6 py-3 rounded-3xl bg-[#F5F5F5] text-black border border-[rgba(0,0,0,0.8)] mx-auto font-light hover:bg-[rgba(0,0,0,0.8)] hover:text-white"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <p>Create a Borrow Proposal</p>
            <Plus
              size={22}
              strokeWidth={4}
              color={isHovered ? "#fff" : "#000"}
              className="transition-opacity duration-300 ease-in-out"
            />
          </button>

          <div className="flex justify-end p-4">
            <div className="flex gap-2">
              {Array.from({ length: totalPages }, (_, index) => (
                <button
                  key={index}
                  className={`px-4 py-2 ${
                    currentPage === index + 1
                      ? "bg-[rgba(0,0,0,0.8)] text-white"
                      : "bg-[#F5F5F5] text-black border-black border"
                  } rounded-lg`}
                  onClick={() => setCurrentPage(index + 1)}
                >
                  {index + 1}
                </button>
              ))}
            </div>
          </div>

          <NewProposalModal
            type={modalType}
            show={isModalOpen}
            onClose={() => setModalOpen((prev) => !prev)}
            title={"Create a Borrow Proposal"}
            proposalId={selectedProposalId}
          />
          <DepositTokenModal
            isOpen={isDepositModalOpen}
            onClose={() => setDepositModalOpen(false)}
            walletAddress={address || ""}
            availableBalance={0}
            onDeposit={async (amount: number) => {
              // Call deposit function here.
              // On successful deposit, show success message and resume pending action.
              toastify.success("Deposit successful");
              handleDepositSuccess();
            }}
          />
        </div>
      </div>
    </main>
  );
};
}

export default Lender;