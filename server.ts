
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { ethers } from "ethers";

dotenv.config();

const app = express();

const PORT = 3000;

// ========================================
// ENVIRONMENT
// ========================================

const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_GATEWAY = process.env.PINATA_GATEWAY;
const RPC_URL = process.env.SEPOLIA_RPC_URL;
const PRIVATE_KEY = process.env.SEPOLIA_PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;

// ========================================
// CHECK ENVIRONMENT
// ========================================

if (!PINATA_JWT) {
    throw new Error("PINATA_JWT is not configured");
}

if (!PINATA_GATEWAY) {
    throw new Error("PINATA_GATEWAY is not configured");
}

if (!RPC_URL) {
    throw new Error("SEPOLIA_RPC_URL is not configured");
}

if (!PRIVATE_KEY) {
    throw new Error("SEPOLIA_PRIVATE_KEY is not configured");
}

if (!CONTRACT_ADDRESS) {
    throw new Error("CONTRACT_ADDRESS is not configured");
}

// ========================================
// MIDDLEWARE
// ========================================

app.use(cors());

app.use(express.json());

// ========================================
// SMART CONTRACT ABI
// ========================================

const ProductTraceabilityABI = [

    "function createBatch(string memory _batchId, string memory _cid) public",

    "function getBatch(string memory _batchId) public view returns (string memory, string memory, uint256, address)",

    "function batchExists(string memory _batchId) public view returns (bool)"

];

// ========================================
// PROVIDER
// ========================================

const provider = new ethers.JsonRpcProvider(

    RPC_URL,

    {
        name: "sepolia",
        chainId: 11155111
    },

    {
        staticNetwork: true,
        batchMaxCount: 1
    }

);

// ========================================
// WALLET
// ========================================

const wallet = new ethers.Wallet(
    PRIVATE_KEY,
    provider
);

// ========================================
// CONTRACT
// ========================================

const contract = new ethers.Contract(

    CONTRACT_ADDRESS,

    ProductTraceabilityABI,

    wallet

);

// ========================================
// FETCH WITH TIMEOUT
// ========================================

async function fetchWithTimeout(

    url: string,

    options: RequestInit = {},

    timeoutMs = 60000

): Promise<Response> {

    const controller =
        new AbortController();

    const timeout =
        setTimeout(

            () => controller.abort(),

            timeoutMs

        );

    try {

        return await fetch(

            url,

            {

                ...options,

                signal:
                    controller.signal

            }

        );

    }

    finally {

        clearTimeout(timeout);

    }

}

// ========================================
// TEST RPC
// ========================================

provider.getBlockNumber()

    .then(

        (block) => {

            console.log(
                "================================"
            );

            console.log(
                "RPC CONNECTED"
            );

            console.log(
                "Sepolia Chain ID: 11155111"
            );

            console.log(
                "Latest block:",
                block
            );

            console.log(
                "================================"
            );

        }

    )

    .catch(

        (error) => {

            console.error(
                "RPC CONNECTION ERROR:",
                error instanceof Error
                    ? error.message
                    : error
            );

        }

    );

// ========================================
// TEST SERVER
// ========================================

app.get(

    "/",

    (_req, res) => {

        res.json({

            success: true,

            message:
                "Product Traceability Backend is running",

            contract:
                CONTRACT_ADDRESS,

            gateway:
                PINATA_GATEWAY

        });

    }

);

// ========================================
// UPLOAD JSON TO IPFS
// ========================================

app.post(

    "/api/upload-ipfs",

    async (req, res) => {

        try {

            const productData =
                req.body;

            if (!productData) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Product data is required"

                });

            }

            // ========================================
            // JSON → BLOB
            // ========================================

            const jsonBlob = new Blob(

                [

                    JSON.stringify(

                        productData,

                        null,

                        2

                    )

                ],

                {

                    type:
                        "application/json"

                }

            );

            // ========================================
            // FORM DATA
            // ========================================

            const formData =
                new FormData();

            formData.append(

                "file",

                jsonBlob,

                `${productData.batchId || "product"}.json`

            );

            // ========================================
            // UPLOAD PINATA
            // ========================================

            console.log(
                "Uploading JSON to IPFS..."
            );

            const response =
                await fetchWithTimeout(

                    "https://uploads.pinata.cloud/v3/files",

                    {

                        method:
                            "POST",

                        headers: {

                            Authorization:
                                `Bearer ${PINATA_JWT}`

                        },

                        body:
                            formData

                    },

                    60000

                );

            const result =
                await response.json() as {

                    data?: {

                        cid?: string;

                    };

                    error?: unknown;

                    message?: string;

                };

            // ========================================
            // CHECK PINATA
            // ========================================

            if (!response.ok) {

                console.error(
                    "Pinata error:",
                    result
                );

                return res.status(500).json({

                    success: false,

                    message:
                        "Upload to IPFS failed",

                    error:
                        result

                });

            }

            // ========================================
            // CID
            // ========================================

            const cid =
                result.data?.cid;

            if (!cid) {

                return res.status(500).json({

                    success: false,

                    message:
                        "CID was not returned by Pinata",

                    data:
                        result

                });

            }

            console.log(
                "IPFS upload successful"
            );

            console.log(
                "CID:",
                cid
            );

            // ========================================
            // RESPONSE
            // ========================================

            return res.json({

                success: true,

                batchId:
                    productData.batchId,

                cid:
                    cid,

                gateway:
                    `https://${PINATA_GATEWAY}/ipfs/${cid}`

            });

        }

        catch (error) {

            console.error(
                "UPLOAD IPFS ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Server error",

                error:

                    error instanceof Error

                        ? error.message

                        : "Unknown error"

            });

        }

    }

);

// ========================================
// CREATE BATCH
// ========================================

app.post(

    "/api/create-batch",

    async (req, res) => {

        try {

            const productData =
                req.body;

            if (
                !productData ||
                !productData.batchId
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "batchId is required"

                });

            }

            const batchId =
                productData.batchId;

            console.log(
                "================================"
            );

            console.log(
                "CREATE BATCH"
            );

            console.log(
                "Batch ID:",
                batchId
            );

            console.log(
                "================================"
            );

            // ========================================
            // UPLOAD TO IPFS
            // ========================================

            const jsonBlob = new Blob(

                [

                    JSON.stringify(

                        productData,

                        null,

                        2

                    )

                ],

                {

                    type:
                        "application/json"

                }

            );

            const formData =
                new FormData();

            formData.append(

                "file",

                jsonBlob,

                `${batchId}.json`

            );

            console.log(
                "Uploading to IPFS..."
            );

            const ipfsResponse =
                await fetchWithTimeout(

                    "https://uploads.pinata.cloud/v3/files",

                    {

                        method:
                            "POST",

                        headers: {

                            Authorization:
                                `Bearer ${PINATA_JWT}`

                        },

                        body:
                            formData

                    },

                    60000

                );

            const ipfsResult =
                await ipfsResponse.json() as {

                    data?: {

                        cid?: string;

                    };

                    error?: unknown;

                    message?: string;

                };

            if (!ipfsResponse.ok) {

                console.error(
                    "Pinata error:",
                    ipfsResult
                );

                return res.status(500).json({

                    success: false,

                    message:
                        "Upload to IPFS failed",

                    error:
                        ipfsResult

                });

            }

            const cid =
                ipfsResult.data?.cid;

            if (!cid) {

                return res.status(500).json({

                    success: false,

                    message:
                        "CID was not returned by Pinata",

                    data:
                        ipfsResult

                });

            }

            console.log(
                "CID:",
                cid
            );

            // ========================================
            // CHECK EXISTING BATCH
            // ========================================

            console.log(
                "Checking blockchain..."
            );

            const exists =
                await contract.batchExists(

                    batchId

                );

            if (exists) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Batch already exists",

                    batchId:
                        batchId,

                    cid:
                        cid

                });

            }

            // ========================================
            // CREATE BLOCKCHAIN RECORD
            // ========================================

            console.log(
                "Writing batch to blockchain..."
            );

            const tx =
                await contract.createBatch(

                    batchId,

                    cid

                );

            console.log(
                "Transaction:",
                tx.hash
            );

            console.log(
                "Waiting for confirmation..."
            );

            const receipt =
                await tx.wait();

            console.log(
                "Blockchain confirmed!"
            );

            // ========================================
            // RESPONSE
            // ========================================

            return res.json({

                success: true,

                batchId:
                    batchId,

                cid:
                    cid,

                transaction:
                    receipt.hash,

                contract:
                    CONTRACT_ADDRESS,

                gateway:
                    `https://${PINATA_GATEWAY}/ipfs/${cid}`

            });

        }

        catch (error) {

            console.error(
                "CREATE BATCH ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Failed to create batch",

                error:

                    error instanceof Error

                        ? error.message

                        : "Unknown error"

            });

        }

    }

);

// ========================================
// GET BATCH FROM BLOCKCHAIN
// ========================================

app.get(

    "/api/batch/:batchId",

    async (req, res) => {

        try {

            const batchId =
                req.params.batchId;

            if (!batchId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Batch ID is required"

                });

            }

            console.log(
                "Reading batch:",
                batchId
            );

            const result =
                await contract.getBatch(

                    batchId

                ) as [

                    string,

                    string,

                    bigint,

                    string

                ];

            return res.json({

                success: true,

                batchId:
                    result[0],

                cid:
                    result[1],

                timestamp:
                    result[2].toString(),

                creator:
                    result[3],

                contract:
                    CONTRACT_ADDRESS

            });

        }

        catch (error) {

            console.error(
                "GET BATCH ERROR:",
                error
            );

            return res.status(404).json({

                success: false,

                message:

                    error instanceof Error

                        ? error.message

                        : "Batch not found"

            });

        }

    }

);

// ========================================
// GET COMPLETE PRODUCT
// BLOCKCHAIN + IPFS
// ========================================

app.get(

    "/api/product/:batchId",

    async (req, res) => {

        try {

            const batchId =
                req.params.batchId;

            if (!batchId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Batch ID is required"

                });

            }

            console.log(
                "================================"
            );

            console.log(
                "GET PRODUCT"
            );

            console.log(
                "Batch ID:",
                batchId
            );

            console.log(
                "================================"
            );

            // ========================================
            // READ BLOCKCHAIN
            // ========================================

            console.log(
                "Reading blockchain..."
            );

            const result =
                await contract.getBatch(

                    batchId

                ) as [

                    string,

                    string,

                    bigint,

                    string

                ];

            const blockchainData = {

                batchId:
                    result[0],

                cid:
                    result[1],

                timestamp:
                    result[2].toString(),

                creator:
                    result[3]

            };

            console.log(
                "Blockchain OK"
            );

            console.log(
                "CID:",
                blockchainData.cid
            );

            // ========================================
            // CHECK CID
            // ========================================

            const cid =
                blockchainData.cid;

            if (!cid) {

                return res.status(404).json({

                    success: false,

                    message:
                        "CID not found for this batch",

                    batchId:
                        batchId

                });

            }

            // ========================================
            // PINATA GATEWAY
            // ========================================

            const ipfsUrl =

                `https://${PINATA_GATEWAY}/ipfs/${cid}`;

            console.log(
                "Reading IPFS..."
            );

            console.log(
                "IPFS URL:",
                ipfsUrl
            );

            // ========================================
            // READ IPFS
            // ========================================

            try {

                const ipfsResponse =

                    await fetchWithTimeout(

                        ipfsUrl,

                        {

                            method:
                                "GET",

                            headers: {

                                Accept:
                                    "application/json"

                            }

                        },

                        60000

                    );

                console.log(
                    "IPFS HTTP status:",
                    ipfsResponse.status
                );

                if (!ipfsResponse.ok) {

                    return res.status(500).json({

                        success: false,

                        message:
                            "Cannot read product data from IPFS",

                        batchId:
                            batchId,

                        cid:
                            cid,

                        status:
                            ipfsResponse.status

                    });

                }

                // ========================================
                // READ JSON
                // ========================================

                const productData =
                    await ipfsResponse.json();

                console.log(
                    "IPFS read successful"
                );

                // ========================================
                // RESPONSE
                // ========================================

                return res.json({

                    success: true,

                    blockchain: {

                        batchId:
                            blockchainData.batchId,

                        cid:
                            blockchainData.cid,

                        timestamp:
                            blockchainData.timestamp,

                        creator:
                            blockchainData.creator,

                        contract:
                            CONTRACT_ADDRESS

                    },

                    product:
                        productData,

                    ipfs: {

                        cid:
                            cid,

                        gateway:
                            ipfsUrl

                    }

                });

            }

            catch (ipfsError) {

                console.error(
                    "IPFS ERROR:",
                    ipfsError
                );

                return res.status(500).json({

                    success: false,

                    message:
                        "Cannot read product data from IPFS",

                    batchId:
                        batchId,

                    cid:
                        cid,

                    gateway:
                        ipfsUrl,

                    error:

                        ipfsError instanceof Error

                            ? ipfsError.message

                            : "Unknown IPFS error"

                });

            }

        }

        catch (error) {

            console.error(
                "GET PRODUCT ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Failed to get product",

                error:

                    error instanceof Error

                        ? error.message

                        : "Unknown error"

            });

        }

    }

);

// ========================================
// START SERVER
// ========================================

app.listen(

    PORT,

    () => {

        console.log(
            "================================"
        );

        console.log(
            "Product Traceability Backend"
        );

        console.log(
            `Server running at http://localhost:${PORT}`
        );

        console.log(
            "Contract:",
            CONTRACT_ADDRESS
        );

        console.log(
            "Pinata Gateway:",
            PINATA_GATEWAY
        );

        console.log(
            "================================"
        );

    }

);