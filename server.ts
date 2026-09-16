import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { ethers } from "ethers";
import multer from "multer";
import * as XLSX from "xlsx";

dotenv.config();

// ============================================================
// APP
// ============================================================

const app = express();

const PORT =
    Number(process.env.PORT) || 3000;


// ============================================================
// ENVIRONMENT
// ============================================================

const PINATA_JWT =
    process.env.PINATA_JWT;

const PINATA_GATEWAY =
    process.env.PINATA_GATEWAY;

const RPC_URL =
    process.env.SEPOLIA_RPC_URL;

const PRIVATE_KEY =
    process.env.SEPOLIA_PRIVATE_KEY;

const CONTRACT_ADDRESS =
    process.env.CONTRACT_ADDRESS;

const FRONTEND_URL =
    process.env.FRONTEND_URL ||
    "http://localhost:5173";


// ============================================================
// CHECK ENVIRONMENT
// ============================================================

if (!PINATA_JWT) {
    throw new Error(
        "PINATA_JWT is not configured"
    );
}

if (!PINATA_GATEWAY) {
    throw new Error(
        "PINATA_GATEWAY is not configured"
    );
}

if (!RPC_URL) {
    throw new Error(
        "SEPOLIA_RPC_URL is not configured"
    );
}

if (!PRIVATE_KEY) {
    throw new Error(
        "SEPOLIA_PRIVATE_KEY is not configured"
    );
}

if (!CONTRACT_ADDRESS) {
    throw new Error(
        "CONTRACT_ADDRESS is not configured"
    );
}


// ============================================================
// MIDDLEWARE
// ============================================================

app.use(cors());

app.use(
    express.json({
        limit: "10mb"
    })
);


// ============================================================
// MULTER
// ============================================================

const upload =
    multer({

        storage:
            multer.memoryStorage(),

        limits: {

            fileSize:
                10 * 1024 * 1024

        }

    });


// ============================================================
// SMART CONTRACT ABI
// ============================================================

const ProductTraceabilityABI = [

    "function createBatch(string memory _batchId, string memory _cid) public",

    "function getBatch(string memory _batchId) public view returns (string memory, string memory, uint256, address)",

    "function batchExists(string memory _batchId) public view returns (bool)"

];


// ============================================================
// PROVIDER
// ============================================================

const provider =
    new ethers.JsonRpcProvider(

        RPC_URL,

        {
            name:
                "sepolia",

            chainId:
                11155111
        },

        {
            staticNetwork:
                true
        }

    );


// ============================================================
// WALLET
// ============================================================

const wallet =
    new ethers.Wallet(

        PRIVATE_KEY,

        provider

    );


// ============================================================
// CONTRACT
// ============================================================

const contract =
    new ethers.Contract(

        CONTRACT_ADDRESS,

        ProductTraceabilityABI,

        wallet

    );


// ============================================================
// FETCH WITH TIMEOUT
// ============================================================

async function fetchWithTimeout(

    url: string,

    options: RequestInit = {},

    timeoutMs: number = 60000

): Promise<Response> {

    const controller =
        new AbortController();

    const timeout =
        setTimeout(

            () => {

                controller.abort();

            },

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


// ============================================================
// CONVERT EXCEL ROW → PRODUCT JSON
// ============================================================

function rowToProduct(
    row: Record<string, unknown>
) {

    return {

        batchId:

            String(

                row.batchId ??
                row.BatchId ??
                row["Batch ID"] ??
                ""

            ).trim(),


        productName:

            String(

                row.productName ??
                row.ProductName ??
                row["Product Name"] ??
                ""

            ).trim(),


        origin:

            String(

                row.origin ??
                row.Origin ??
                ""

            ).trim(),


        productionDate:

            String(

                row.productionDate ??
                row.ProductionDate ??
                row["Production Date"] ??
                ""

            ).trim(),


        quantity:

            Number(

                row.quantity ??
                row.Quantity ??
                0

            ),


        unit:

            String(

                row.unit ??
                row.Unit ??
                ""

            ).trim(),


        processing: {

            temperature:

                Number(

                    row.temperature ??
                    row.Temperature ??
                    row["Temperature"] ??
                    0

                ),


            humidity:

                Number(

                    row.humidity ??
                    row.Humidity ??
                    row["Humidity"] ??
                    0

                ),


            duration:

                Number(

                    row.duration ??
                    row.Duration ??
                    row["Duration"] ??
                    0

                )

        }

    };

}


// ============================================================
// VALIDATE PRODUCT
// ============================================================

function validateProduct(

    product:
        ReturnType<typeof rowToProduct>

): string[] {

    const errors: string[] = [];


    if (!product.batchId) {

        errors.push(
            "batchId is empty"
        );

    }


    if (!product.productName) {

        errors.push(
            "productName is empty"
        );

    }


    if (!product.origin) {

        errors.push(
            "origin is empty"
        );

    }


    if (!product.productionDate) {

        errors.push(
            "productionDate is empty"
        );

    }


    if (
        !Number.isFinite(
            product.quantity
        )
    ) {

        errors.push(
            "quantity is invalid"
        );

    }


    if (!product.unit) {

        errors.push(
            "unit is empty"
        );

    }


    if (
        !Number.isFinite(
            product.processing.temperature
        )
    ) {

        errors.push(
            "temperature is invalid"
        );

    }


    if (
        !Number.isFinite(
            product.processing.humidity
        )
    ) {

        errors.push(
            "humidity is invalid"
        );

    }


    if (
        !Number.isFinite(
            product.processing.duration
        )
    ) {

        errors.push(
            "duration is invalid"
        );

    }


    return errors;

}


// ============================================================
// HOME
// ============================================================

app.get(

    "/",

    (_req, res) => {

        res.json({

            success:
                true,

            message:
                "Product Traceability Backend is running",

            contract:
                CONTRACT_ADDRESS,

            gateway:
                PINATA_GATEWAY,

            frontend:
                FRONTEND_URL

        });

    }

);


// ============================================================
// UPLOAD JSON TO PINATA PUBLIC IPFS
// ============================================================

app.post(

    "/api/upload-ipfs",

    async (req, res) => {

        try {

            const productData =
                req.body;


            if (
                !productData ||
                Object.keys(productData).length === 0
            ) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Product data is required"

                });

            }


            const jsonBlob =
                new Blob(

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


            // PUBLIC IPFS

            formData.append(

                "network",

                "public"

            );


            formData.append(

                "file",

                jsonBlob,

                `${

                    productData.batchId ||

                    "product"

                }.json`

            );


            console.log(
                "Uploading JSON to Public IPFS..."
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

                    }

                );


            const result =
                await response.json() as {

                    data?: {

                        cid?: string;

                    };

                    error?: unknown;

                    message?: string;

                };


            if (!response.ok) {

                console.error(
                    "Pinata error:",
                    result
                );


                return res.status(500).json({

                    success:
                        false,

                    message:
                        "Upload to IPFS failed",

                    error:
                        result

                });

            }


            const cid =
                result.data?.cid;


            if (!cid) {

                return res.status(500).json({

                    success:
                        false,

                    message:
                        "CID was not returned by Pinata"

                });

            }


            const gatewayUrl =
                `https://${PINATA_GATEWAY}/ipfs/${cid}`;


            return res.json({

                success:
                    true,

                batchId:
                    productData.batchId,

                cid:
                    cid,

                gateway:
                    gatewayUrl

            });


        } catch (error) {

            console.error(
                "UPLOAD IPFS ERROR:",
                error
            );


            return res.status(500).json({

                success:
                    false,

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


// ============================================================
// CREATE BATCH
// JSON → IPFS → BLOCKCHAIN
// ============================================================

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

                    success:
                        false,

                    message:
                        "batchId is required"

                });

            }


            const batchId =
                String(

                    productData.batchId

                ).trim();


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


            // ==================================================
            // CHECK EXISTING
            // ==================================================

            const exists =
                await contract.batchExists(

                    batchId

                );


            if (exists) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Batch already exists",

                    batchId:
                        batchId

                });

            }


            // ==================================================
            // CREATE JSON
            // ==================================================

            const jsonBlob =
                new Blob(

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

                "network",

                "public"

            );


            formData.append(

                "file",

                jsonBlob,

                `${batchId}.json`

            );


            // ==================================================
            // IPFS
            // ==================================================

            console.log(
                "Uploading to Public IPFS..."
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

                    }

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

                return res.status(500).json({

                    success:
                        false,

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

                    success:
                        false,

                    message:
                        "CID was not returned"

                });

            }


            const ipfsUrl =
                `https://${PINATA_GATEWAY}/ipfs/${cid}`;


            console.log(
                "CID:",
                cid
            );


            // ==================================================
            // BLOCKCHAIN
            // ==================================================

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


            const receipt =
                await tx.wait();


            console.log(
                "Blockchain confirmed!"
            );


            const qrUrl =
                `${

                    FRONTEND_URL

                }/product/${

                    encodeURIComponent(

                        batchId

                    )

                }`;


            return res.json({

                success:
                    true,

                batchId:
                    batchId,

                cid:
                    cid,

                transaction:
                    receipt.hash,

                contract:
                    CONTRACT_ADDRESS,

                gateway:
                    ipfsUrl,

                qrUrl:
                    qrUrl

            });


        } catch (error) {

            console.error(
                "CREATE BATCH ERROR:",
                error
            );


            return res.status(500).json({

                success:
                    false,

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


// ============================================================
// GET BATCH
// ============================================================

app.get(

    "/api/batch/:batchId",

    async (req, res) => {

        try {

            const batchId =
                req.params.batchId;


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

                success:
                    true,

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


        } catch (error) {

            console.error(
                "GET BATCH ERROR:",
                error
            );


            return res.status(404).json({

                success:
                    false,

                message:

                    error instanceof Error

                        ? error.message

                        : "Batch not found"

            });

        }

    }

);


// ============================================================
// GET COMPLETE PRODUCT
// BLOCKCHAIN + IPFS
// ============================================================

app.get(

    "/api/product/:batchId",

    async (req, res) => {

        try {

            const batchId =
                req.params.batchId;


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


            // ==================================================
            // BLOCKCHAIN
            // ==================================================

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


            const returnedBatchId =
                result[0];


            const cid =
                result[1];


            const timestamp =
                result[2].toString();


            const creator =
                result[3];


            console.log(
                "Blockchain OK"
            );


            console.log(
                "CID:",
                cid
            );


            if (!cid) {

                return res.status(404).json({

                    success:
                        false,

                    message:
                        "CID not found",

                    batchId:
                        batchId

                });

            }


            // ==================================================
            // IPFS
            // ==================================================

            const ipfsUrl =
                `https://${PINATA_GATEWAY}/ipfs/${cid}`;


            console.log(
                "Reading IPFS..."
            );


            console.log(
                "IPFS URL:",
                ipfsUrl
            );


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

                    success:
                        false,

                    message:
                        "Cannot read product data from IPFS",

                    batchId:
                        batchId,

                    cid:
                        cid,

                    status:
                        ipfsResponse.status,

                    gateway:
                        ipfsUrl

                });

            }


            const productData =
                await ipfsResponse.json();


            console.log(
                "IPFS OK"
            );


            return res.json({

                success:
                    true,

                blockchain: {

                    batchId:
                        returnedBatchId,

                    cid:
                        cid,

                    timestamp:
                        timestamp,

                    creator:
                        creator,

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


        } catch (error) {

            console.error(
                "GET PRODUCT ERROR:",
                error
            );


            return res.status(500).json({

                success:
                    false,

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


// ============================================================
// EXCEL IMPORT
//
// Excel
//   ↓
// Read rows
//   ↓
// Product JSON
//   ↓
// Pinata Public IPFS
//   ↓
// CID
//   ↓
// Blockchain
//   ↓
// TX Hash
//   ↓
// QR URL
//   ↓
// Updated Excel
// ============================================================

app.post(

    "/api/upload-excel",

    upload.single("file"),

    async (req, res) => {

        try {

            // ==================================================
            // CHECK FILE
            // ==================================================

            if (!req.file) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Excel file is required"

                });

            }


            console.log(
                "================================"
            );

            console.log(
                "EXCEL IMPORT"
            );

            console.log(
                "File:",
                req.file.originalname
            );

            console.log(
                "================================"
            );


            // ==================================================
            // READ WORKBOOK
            // ==================================================

            const workbook =
                XLSX.read(

                    req.file.buffer,

                    {

                        type:
                            "buffer",

                        cellDates:
                            false

                    }

                );


            if (
                workbook.SheetNames.length === 0
            ) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Excel file has no worksheet"

                });

            }


            const sheetName =
                workbook.SheetNames[0];


            const worksheet =
                workbook.Sheets[sheetName];


            const rows =
                XLSX.utils.sheet_to_json<
                    Record<string, unknown>
                >(

                    worksheet,

                    {

                        defval:
                            ""

                    }

                );


            if (rows.length === 0) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Excel file has no data"

                });

            }


            console.log(
                "Rows:",
                rows.length
            );


            // ==================================================
            // PROCESS RESULTS
            // ==================================================

            const processedRows:
                Record<string, unknown>[] = [];


            let successCount =
                0;


            let errorCount =
                0;


            // ==================================================
            // PROCESS EACH ROW
            // ==================================================

            for (

                let i = 0;

                i < rows.length;

                i++

            ) {

                const rawRow =
                    rows[i];


                const excelRow =
                    i + 2;


                const product =
                    rowToProduct(
                        rawRow
                    );


                console.log(
                    "--------------------------------"
                );


                console.log(
                    "Processing Excel row:",
                    excelRow
                );


                console.log(
                    "Batch ID:",
                    product.batchId
                );


                // ==================================================
                // VALIDATE
                // ==================================================

                const validationErrors =
                    validateProduct(
                        product
                    );


                if (
                    validationErrors.length > 0
                ) {

                    errorCount++;


                    processedRows.push({

                        ...rawRow,

                        CID:
                            "",

                        "IPFS URL":
                            "",

                        "Transaction Hash":
                            "",

                        Status:
                            "ERROR",

                        "Error Message":
                            validationErrors.join(
                                "; "
                            ),

                        "QR URL":
                            ""

                    });


                    continue;

                }


                try {

                    // ==================================================
                    // CHECK EXISTING
                    // ==================================================

                    const exists =
                        await contract.batchExists(

                            product.batchId

                        );


                    if (exists) {

                        errorCount++;


                        processedRows.push({

                            ...rawRow,

                            CID:
                                "",

                            "IPFS URL":
                                "",

                            "Transaction Hash":
                                "",

                            Status:
                                "ALREADY_EXISTS",

                            "Error Message":
                                "Batch already exists on blockchain",

                            "QR URL":
                                `${FRONTEND_URL}/product/${encodeURIComponent(
                                    product.batchId
                                )}`

                        });


                        continue;

                    }


                    // ==================================================
                    // CREATE PRODUCT JSON
                    // ==================================================

                    const jsonBlob =
                        new Blob(

                            [

                                JSON.stringify(

                                    product,

                                    null,

                                    2

                                )

                            ],

                            {

                                type:
                                    "application/json"

                            }

                        );


                    // ==================================================
                    // FORM DATA
                    // ==================================================

                    const formData =
                        new FormData();


                    // PUBLIC IPFS

                    formData.append(

                        "network",

                        "public"

                    );


                    formData.append(

                        "file",

                        jsonBlob,

                        `${product.batchId}.json`

                    );


                    // ==================================================
                    // UPLOAD PINATA
                    // ==================================================

                    console.log(
                        "Uploading to Public IPFS..."
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


                    if (
                        !ipfsResponse.ok
                    ) {

                        throw new Error(

                            ipfsResult.message ||

                            "Pinata upload failed"

                        );

                    }


                    const cid =
                        ipfsResult.data?.cid;


                    if (!cid) {

                        throw new Error(
                            "CID was not returned by Pinata"
                        );

                    }


                    console.log(
                        "CID:",
                        cid
                    );


                    // ==================================================
                    // VERIFY IPFS PUBLIC ACCESS
                    // ==================================================

                    const ipfsUrl =
                        `https://${PINATA_GATEWAY}/ipfs/${cid}`;


                    console.log(
                        "Verifying IPFS:",
                        ipfsUrl
                    );


                    const verifyResponse =
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


                    if (
                        !verifyResponse.ok
                    ) {

                        throw new Error(

                            `IPFS verification failed: HTTP ${verifyResponse.status}`

                        );

                    }


                    console.log(
                        "IPFS verification OK"
                    );


                    // ==================================================
                    // BLOCKCHAIN
                    // ==================================================

                    console.log(
                        "Writing blockchain..."
                    );


                    const tx =
                        await contract.createBatch(

                            product.batchId,

                            cid

                        );


                    console.log(
                        "Transaction:",
                        tx.hash
                    );


                    const receipt =
                        await tx.wait();


                    console.log(
                        "Blockchain confirmed"
                    );


                    // ==================================================
                    // QR URL
                    // ==================================================

                    const qrUrl =
                        `${FRONTEND_URL}/product/${encodeURIComponent(
                            product.batchId
                        )}`;


                    // ==================================================
                    // SUCCESS
                    // ==================================================

                    successCount++;


                    processedRows.push({

                        ...rawRow,

                        CID:
                            cid,

                        "IPFS URL":
                            ipfsUrl,

                        "Transaction Hash":
                            receipt.hash,

                        Status:
                            "SUCCESS",

                        "Error Message":
                            "",

                        "QR URL":
                            qrUrl

                    });


                } catch (rowError) {

                    errorCount++;


                    console.error(
                        "ROW ERROR:",
                        rowError
                    );


                    processedRows.push({

                        ...rawRow,

                        CID:
                            "",

                        "IPFS URL":
                            "",

                        "Transaction Hash":
                            "",

                        Status:
                            "ERROR",

                        "Error Message":

                            rowError instanceof Error

                                ? rowError.message

                                : "Unknown error",

                        "QR URL":
                            ""

                    });

                }

            }


            // ==================================================
            // CREATE UPDATED SHEET
            // ==================================================

            const resultWorksheet =
                XLSX.utils.json_to_sheet(

                    processedRows

                );


            // ==================================================
            // AUTO COLUMN WIDTH
            // ==================================================

            const allRows =
                processedRows;


            const headers =
                allRows.length > 0

                    ? Object.keys(
                        allRows[0]
                    )

                    : [];


            resultWorksheet["!cols"] =
                headers.map(

                    (header) => {

                        let maxLength =
                            header.length;


                        for (
                            const row
                            of allRows
                        ) {

                            const value =
                                row[header];


                            const text =
                                value === undefined ||
                                value === null

                                    ? ""

                                    : String(
                                        value
                                    );


                            maxLength =
                                Math.max(

                                    maxLength,

                                    text.length

                                );

                        }


                        return {

                            wch:
                                Math.min(
                                    Math.max(
                                        maxLength + 2,
                                        10
                                    ),
                                    80
                                )

                        };

                    }

                );


            // ==================================================
            // REPLACE ORIGINAL SHEET
            // ==================================================

            workbook.Sheets[sheetName] =
                resultWorksheet;


            // ==================================================
            // WRITE EXCEL
            // ==================================================

            const outputBuffer =
                XLSX.write(

                    workbook,

                    {

                        type:
                            "buffer",

                        bookType:
                            "xlsx"

                    }

                );


            // ==================================================
            // SAFE ORIGINAL FILE NAME
            // ==================================================

            const originalName =
                req.file.originalname
                    .replace(
                        /["\r\n]/g,
                        "_"
                    );


            // ==================================================
            // RESPONSE HEADERS
            // ==================================================

            res.setHeader(

                "Content-Type",

                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

            );


            res.setHeader(

                "Content-Disposition",

                `attachment; filename="${originalName}"`

            );


            res.setHeader(

                "X-Excel-Total-Rows",

                String(
                    rows.length
                )

            );


            res.setHeader(

                "X-Excel-Success",

                String(
                    successCount
                )

            );


            res.setHeader(

                "X-Excel-Errors",

                String(
                    errorCount
                )

            );


            // ==================================================
            // LOG
            // ==================================================

            console.log(
                "================================"
            );

            console.log(
                "EXCEL IMPORT COMPLETE"
            );

            console.log(
                "Total:",
                rows.length
            );

            console.log(
                "Success:",
                successCount
            );

            console.log(
                "Errors:",
                errorCount
            );

            console.log(
                "Returning updated Excel:",
                originalName
            );

            console.log(
                "================================"
            );


            // ==================================================
            // RETURN FILE
            // ==================================================

            return res.send(
                outputBuffer
            );


        } catch (error) {

            console.error(
                "EXCEL IMPORT ERROR:",
                error
            );


            return res.status(500).json({

                success:
                    false,

                message:
                    "Failed to process Excel",

                error:

                    error instanceof Error

                        ? error.message

                        : "Unknown error"

            });

        }

    }

);


// ============================================================
// START SERVER
// ============================================================

app.listen(

    PORT,

    "0.0.0.0",

    () => {

        console.log(
            "================================"
        );

        console.log(
            "Product Traceability Backend"
        );

        console.log(
            `Server running on port ${PORT}`
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
            "Frontend URL:",
            FRONTEND_URL
        );

        console.log(
            "================================"
        );

    }

);