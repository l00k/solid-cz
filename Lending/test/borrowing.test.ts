import { TokenMock } from '@/TokenMock';
import {
    LendingProtocol,
    LoanFullyRepaidEvent,
    LoanOpenedEvent,
    LoanPartiallyRepaidEvent
} from '@/LendingProtocol';
import { PriceFeedMock } from '@/PriceFeedMock';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, ContractTransaction } from 'ethers';
import { ethers } from 'hardhat';
import { assertEvent, assertIsAvailableOnlyForOwner, createTokenMock, deployContract, txExec } from './helpers/utils';


const WBTC_ADDRESS = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599';


describe('Borrowing component', () => {
    let owner : SignerWithAddress;
    let alice : SignerWithAddress;
    let bob : SignerWithAddress;
    let carol : SignerWithAddress;
    
    let mainContract : LendingProtocol;
    
    let smplToken : TokenMock;
    let smplToken2 : TokenMock;
    
    let priceFeedContract : PriceFeedMock;
    let priceFeedContract2 : PriceFeedMock;
    
    
    async function deposit (
        account : SignerWithAddress,
        tokenContract : TokenMock,
        amount : BigNumber
    )
    {
        // approve amount before depositing
        await txExec(
            tokenContract
                .connect(account)
                .approve(
                    mainContract.address,
                    amount
                )
        );
        
        return mainContract
            .connect(account)
            .deposit(
                tokenContract.address,
                amount
            );
    }
    
    async function repay (
        account : SignerWithAddress,
        tokenContract : TokenMock,
        amount : BigNumber
    ) : Promise<ContractTransaction>
    {
        // approve amount before repaying
        await txExec(
            tokenContract
                .connect(account)
                .approve(
                    mainContract.address,
                    amount
                )
        );
        
        return mainContract
            .connect(account)
            .repay(
                tokenContract.address,
                amount
            );
    }
    
    async function pushNewPriceIntoFeed (
        priceFeedContract : PriceFeedMock,
        price : BigNumber
    )
    {
        return priceFeedContract
            .pushRoundData({
                answer: price,
                roundId: 0,
                answeredInRound: 0,
                startedAt: 0,
                updatedAt: 0,
            });
    }
    
    
    before(async() => {
        [ owner, alice, bob, carol ] = await ethers.getSigners();
    });
    
    beforeEach(async() => {
        mainContract = await deployContract('LendingProtocol');
        
        // create sample tokens
        smplToken = await createTokenMock('Sample', 'SMPL');
        smplToken2 = await createTokenMock('Sample2', 'SMPL2', 12);
        
        // create price feeds
        priceFeedContract = await deployContract('PriceFeedMock');
        await txExec(
            priceFeedContract.setDecimals(8)
        );
        await txExec(
            pushNewPriceIntoFeed(priceFeedContract, ethers.utils.parseUnits('25', 8))
        );
        
        priceFeedContract2 = await deployContract('PriceFeedMock');
        await txExec(
            priceFeedContract2.setDecimals(6)
        );
        await txExec(
            pushNewPriceIntoFeed(priceFeedContract2, ethers.utils.parseUnits('10', 6))
        );
        
        // add supported tokens
        await txExec(
            mainContract
                .connect(owner)
                .addSupportedAsset(
                    smplToken.address,
                    priceFeedContract.address
                )
        );
        
        await txExec(
            mainContract
                .connect(owner)
                .addSupportedAsset(
                    smplToken2.address,
                    priceFeedContract2.address
                )
        );
        
        // setup collateral factor
        await txExec(
            mainContract
                .connect(owner)
                .setTokenCollateralFactor(
                    smplToken.address,
                    2.5e7
                )
        );
        
        await txExec(
            mainContract
                .connect(owner)
                .setTokenCollateralFactor(
                    smplToken2.address,
                    5e7
                )
        );
    });
    
    
    describe('Initial state', () => {
        it('Should return proper token available to borrow in total', async() => {
            expect(
                await mainContract.getTotalTokenBorrowable(smplToken.address)
            ).to.be.equal(0);
        });
        
        it('Should return proper token available to borrow by account', async() => {
            expect(
                await mainContract.getAccountTokenBorrowable(smplToken.address, alice.address)
            ).to.be.equal(0);
        });
        
        it('Should return proper token debit by account', async() => {
            expect(
                await mainContract.getAccountTokenDebit(smplToken.address, alice.address)
            ).to.be.equal(0);
        });
        
        it('Should return proper total debit by account', async() => {
            expect(
                await mainContract.getAccountDebitValue(alice.address)
            ).to.be.equal(0);
        });
        
        it('Should return proper withdrawable amount by account', async() => {
            expect(
                await mainContract.getAccountTokenWithdrawable(smplToken.address, alice.address)
            ).to.be.equal(0);
        });
        
        it('Should return proper borrowed amount', async() => {
            expect(
                await mainContract.getTotalTokenDebit(smplToken.address)
            ).to.be.equal(0);
        });
        
        it('Repaying should do nothing', async() => {
            const [ tx, result ] = await txExec(
                mainContract
                    .connect(alice)
                    .repay(
                        smplToken2.address,
                        ethers.utils.parseUnits('50', 12)
                    )
            );
            expect(result.events.length).to.be.equal(0);
        });
    });
    
    
    describe('For not supported token', () => {
        it('getTotalTokenBorrowable() should revert', async() => {
            expect(
                mainContract.getTotalTokenBorrowable(WBTC_ADDRESS)
            ).to.be.revertedWith('TokenIsNotSupported()');
        });
        
        it('getAccountTokenBorrowable() should revert', async() => {
            expect(
                mainContract.getAccountTokenBorrowable(WBTC_ADDRESS, alice.address)
            ).to.be.revertedWith('TokenIsNotSupported()');
        });
        
        it('getAccountTokenDebit() should revert', async() => {
            expect(
                mainContract.getAccountTokenDebit(WBTC_ADDRESS, alice.address)
            ).to.be.revertedWith('TokenIsNotSupported()');
        });
        
        it('getAccountTokenWithdrawable() should revert', async() => {
            expect(
                mainContract
                    .connect(alice)
                    .getAccountTokenWithdrawable(WBTC_ADDRESS, alice.address)
            ).to.be.revertedWith('TokenIsNotSupported()');
        });
        
        it('getTotalTokenDebit() should revert', async() => {
            expect(
                mainContract
                    .connect(alice)
                    .getTotalTokenDebit(WBTC_ADDRESS)
            ).to.be.revertedWith('TokenIsNotSupported()');
        });
        
        it('borrow() should revert', async() => {
            const tx = mainContract
                .connect(alice)
                .borrow(WBTC_ADDRESS, ethers.utils.parseUnits('1', 18));
            await expect(tx).to.be.revertedWith('TokenIsNotSupported()');
        });
        
        it('repay() should revert', async() => {
            const tx = mainContract
                .connect(alice)
                .borrow(WBTC_ADDRESS, ethers.utils.parseUnits('1', 18));
            await expect(tx).to.be.revertedWith('TokenIsNotSupported()');
        });
    });
    
    
    describe('with liquidity provided by Bob and Carol', () => {
        beforeEach(async() => {
            await txExec(
                deposit(
                    bob,
                    smplToken,
                    ethers.utils.parseUnits('100', 18)
                )
            );
            
            await txExec(
                deposit(
                    carol,
                    smplToken,
                    ethers.utils.parseUnits('400', 18)
                )
            );
            
            await txExec(
                deposit(
                    carol,
                    smplToken2,
                    ethers.utils.parseUnits('400', 12)
                )
            );
        });
        
        
        it('Should return proper token available to borrow in total', async() => {
            expect(
                await mainContract.getTotalTokenBorrowable(smplToken.address)
            ).to.be.equal(ethers.utils.parseUnits('500', 18));
            
            expect(
                await mainContract.getTotalTokenBorrowable(smplToken2.address)
            ).to.be.equal(ethers.utils.parseUnits('400', 12));
        });
        
        it('Should return proper token available to borrow by account', async() => {
            expect(
                await mainContract.getAccountTokenBorrowable(smplToken.address, alice.address)
            ).to.be.equal(0);
            
            expect(
                await mainContract.getAccountTokenBorrowable(smplToken2.address, alice.address)
            ).to.be.equal(0);
        });
        
        it('Should not be possible to borrow more than account liquidity', async() => {
            const tx = mainContract
                .connect(alice)
                .borrow(smplToken.address, ethers.utils.parseUnits('1', 18));
            await expect(tx).to.be.revertedWith('AmountExceedBorrowableLimit()');
        });
        
        
        // with borrowable fraction configured
        // with liquidity provided by Bob and Carol
        describe('with liquidity provided by Alice', () => {
            beforeEach(async() => {
                await txExec(
                    deposit(
                        alice,
                        smplToken,
                        ethers.utils.parseUnits('1000', 18)
                    )
                );
            });
            
            
            it('Should return proper account liquidity', async() => {
                expect(
                    await mainContract.getAccountCollateralization(alice.address)
                ).to.be.equal(ethers.utils.parseUnits('6250', 8));
            });
            
            it('Should return proper token available to borrow', async() => {
                expect(
                    await mainContract.getTotalTokenBorrowable(smplToken.address)
                ).to.be.equal(ethers.utils.parseUnits('1500', 18));
                
                expect(
                    await mainContract.getTotalTokenBorrowable(smplToken2.address)
                ).to.be.equal(ethers.utils.parseUnits('400', 12));
            });
            
            it('Should return proper token available to borrow by account', async() => {
                const amount = await mainContract.getAccountTokenBorrowable(smplToken.address, alice.address);
                // 1000 * 25 * 0.25 / 25
                expect(amount).to.be.equal(ethers.utils.parseUnits('250', 18));
            });
            
            it('Should return limited token available to borrow by account', async() => {
                const amount2 = await mainContract.getAccountTokenBorrowable(smplToken2.address, alice.address);
                // 1000 * 25 * 0.25 / 10 = 625
                // 625 > 400 (total available)
                expect(amount2).to.be.equal(ethers.utils.parseUnits('400', 12));
            });
            
            it('Should return proper withdrawable amount', async() => {
                expect(
                    await mainContract.getAccountTokenWithdrawable(smplToken.address, alice.address)
                ).to.be.equal(ethers.utils.parseUnits('1000', 18));
            });
            
            
            // with borrowable fraction configured
            // with liquidity provided by Bob and Carol
            // with liquidity provided by Alice
            describe('borrowing', () => {
                it('Should not be possible to borrow more than account liquidity', async() => {
                    const tx = mainContract
                        .connect(alice)
                        .borrow(smplToken.address, ethers.utils.parseUnits('251', 18));
                    await expect(tx).to.be.revertedWith('AmountExceedBorrowableLimit()');
                });
            
                it('Should revert when transfer fails', async() => {
                    await txExec(
                        smplToken.setReturnValueOnTransfer(false)
                    );
                    
                    const tx = mainContract
                        .connect(alice)
                        .borrow(smplToken.address, ethers.utils.parseUnits('100', 18));
                    await expect(tx).to.be.revertedWith('CouldNotTransferFunds()');
                });
                
                it('Should emit event', async() => {
                    const [ tx, result ] = await txExec(
                        mainContract
                            .connect(alice)
                            .borrow(
                                smplToken.address,
                                ethers.utils.parseUnits('100', 18)
                            )
                    );
                    
                    await assertEvent<LoanOpenedEvent>(result, 'LoanOpened', {
                        who: alice.address,
                        token: smplToken.address,
                        amount: ethers.utils.parseUnits('100', 18),
                    });
                });
                
                it('Should transfer funds', async() => {
                    const txCallback = () => mainContract
                        .connect(alice)
                        .borrow(
                            smplToken.address,
                            ethers.utils.parseUnits('100', 18)
                        );
                    
                    await expect(txCallback).to.changeTokenBalances(
                        smplToken,
                        [ alice, mainContract ],
                        [ ethers.utils.parseUnits('100', 18), ethers.utils.parseUnits('-100', 18) ]
                    );
                });
            });
            
            
            // with borrowable fraction configured
            // with liquidity provided by Bob and Carol
            // with liquidity provided by Alice
            describe('with Alice borrowed funds', () => {
                beforeEach(async() => {
                    await txExec(
                        mainContract
                            .connect(alice)
                            .borrow(
                                smplToken2.address,
                                ethers.utils.parseUnits('100', 12)
                            )
                    );
                });
                
                it('Should reduce account liqudity', async() => {
                    expect(
                        await mainContract.getAccountCollateralization(alice.address)
                    ).to.be.equal(ethers.utils.parseUnits('5250', 8));
                });
                
                it('Should return proper borrowed amount', async() => {
                    expect(
                        await mainContract.getTotalTokenDebit(smplToken2.address)
                    ).to.be.equal(ethers.utils.parseUnits('100', 12));
                });
                
                it('Should return proper token debit', async() => {
                    expect(
                        await mainContract.getAccountTokenDebit(smplToken2.address, alice.address)
                    ).to.be.equal(ethers.utils.parseUnits('100', 12));
                });
                
                it('Should return proper debit value', async() => {
                    expect(
                        await mainContract.getAccountDebitValue(alice.address)
                    ).to.be.equal(ethers.utils.parseUnits('1000', 8));
                });
                
                it('Should return proper token available to borrow by account', async() => {
                    const amount = await mainContract.getAccountTokenBorrowable(smplToken.address, alice.address);
                    // (1000 * 25 * 0.25 - 100 * 10) / 25 = 210
                    expect(amount).to.be.equal(ethers.utils.parseUnits('210', 18));
                });
                
                it('Should return limited token available to borrow by account', async() => {
                    const amount2 = await mainContract.getAccountTokenBorrowable(smplToken2.address, alice.address);
                    // (1000 * 25 * 0.25 - 100 * 10) / 10 = 525
                    // 525 > 300 (total available)
                    expect(amount2).to.be.equal(ethers.utils.parseUnits('300', 12));
                });
                
                it('Should reduce withdrawable amount', async() => {
                    const amount = await mainContract.getAccountTokenWithdrawable(smplToken.address, alice.address);
                    // (1000 * 25 * 0.25 - 100 * 10) / 0.25 / 25
                    expect(amount).to.be.equal(ethers.utils.parseUnits('840', 18));
                });
                
                it('Should not be able to withdraw more than allowed', async() => {
                    const tx = mainContract
                        .connect(alice)
                        .withdraw(
                            smplToken.address,
                            ethers.utils.parseUnits('841', 18)
                        );
                    await expect(tx).to.be.revertedWith('AmountExceedWithdrawableLimit()');
                });
                
                
                // with borrowable fraction configured
                // with liquidity provided by Bob and Carol
                // with liquidity provided by Alice
                // with Alice borrowed funds
                describe('with collateral asset price drop', () => {
                    beforeEach(async() => {
                        await pushNewPriceIntoFeed(
                            priceFeedContract,
                            ethers.utils.parseUnits('1', 8)
                        );
                    });
                    
                    it('Should have 0 withdrawable amount', async() => {
                        expect(
                            await mainContract.getAccountTokenWithdrawable(smplToken.address, alice.address)
                        ).to.be.equal(0);
                    });
                    
                    it('Should have 0 token available to borrow by account', async() => {
                        expect(
                            await mainContract.getAccountTokenBorrowable(smplToken.address, alice.address)
                        ).to.be.equal(0);
                    });
                    
                    it('Should have 0 token available to borrow by account', async() => {
                        expect(
                            await mainContract.getAccountTokenBorrowable(smplToken2.address, alice.address)
                        ).to.be.equal(0);
                    });
                    
                    it('Should have negative liqudity after collateral asset price drop', async() => {
                        // 1000 * 1 * 0.25 - 100 * 10
                        expect(
                            await mainContract.getAccountCollateralization(alice.address)
                        ).to.be.equal(ethers.utils.parseUnits('-750', 8));
                    });
                });
                
                
                // with borrowable fraction configured
                // with liquidity provided by Bob and Carol
                // with liquidity provided by Alice
                // with Alice borrowed funds
                describe('repaying partially', () => {
                    it('Should revert without sufficient allowance', async() => {
                        const tx = mainContract
                            .connect(alice)
                            .repay(
                                smplToken2.address,
                                ethers.utils.parseUnits('50', 12)
                            );
                        await expect(tx).to.be.revertedWith('InsufficientAllowance()');
                    });
                    
                    it('Should revert without sufficient token balance', async() => {
                        const balance = await smplToken2.balanceOf(alice.address);
                        await txExec(
                            smplToken2
                                .connect(alice)
                                .transfer(bob.address, balance)
                        );
                        
                        const tx = repay(
                            alice,
                            smplToken2,
                            ethers.utils.parseUnits('50', 12)
                        );
                        await expect(tx).to.be.revertedWith('ERC20: transfer amount exceeds balance');
                    });
            
                    it('Should revert when transfer fails', async() => {
                        await txExec(
                            smplToken2.setReturnValueOnTransfer(false)
                        );
                        
                        const tx = repay(
                            alice,
                            smplToken2,
                            ethers.utils.parseUnits('50', 12)
                        );
                        await expect(tx).to.be.revertedWith('CouldNotTransferFunds()');
                    });
                    
                    it('Should emit event', async() => {
                        const [ tx, result ] = await txExec(
                            repay(
                                alice,
                                smplToken2,
                                ethers.utils.parseUnits('50', 12)
                            )
                        );
                        
                        await assertEvent<LoanPartiallyRepaidEvent>(result, 'LoanPartiallyRepaid', {
                            who: alice.address,
                            token: smplToken2.address,
                            amount: ethers.utils.parseUnits('50', 12),
                        });
                    });
                    
                    it('Should transfer funds', async() => {
                        const txCallback = () => repay(
                            alice,
                            smplToken2,
                            ethers.utils.parseUnits('50', 12)
                        );
                        
                        await expect(txCallback).to.changeTokenBalances(
                            smplToken2,
                            [ alice, mainContract ],
                            [ ethers.utils.parseUnits('-50', 12), ethers.utils.parseUnits('50', 12) ]
                        );
                    });
                });
                
                
                // with borrowable fraction configured
                // with liquidity provided by Bob and Carol
                // with liquidity provided by Alice
                // with Alice borrowed funds
                describe('partially repaid', () => {
                    beforeEach(async() => {
                        await txExec(
                            repay(
                                alice,
                                smplToken2,
                                ethers.utils.parseUnits('50', 12)
                            )
                        );
                    });
                    
                    it('Should increase account liqudity', async() => {
                        expect(
                            await mainContract.getAccountCollateralization(alice.address)
                        ).to.be.equal(ethers.utils.parseUnits('5750', 8));
                    });
                    
                    it('Should return proper borrowed amount', async() => {
                        expect(
                            await mainContract.getTotalTokenDebit(smplToken2.address)
                        ).to.be.equal(ethers.utils.parseUnits('50', 12));
                    });
                    
                    it('Should return proper token debit', async() => {
                        expect(
                            await mainContract.getAccountTokenDebit(smplToken2.address, alice.address)
                        ).to.be.equal(ethers.utils.parseUnits('50', 12));
                    });
                    
                    it('Should return proper debit value', async() => {
                        expect(
                            await mainContract.getAccountDebitValue(alice.address)
                        ).to.be.equal(ethers.utils.parseUnits('500', 8));
                    });
                    
                    it('Should return proper token available to borrow by account', async() => {
                        const amount = await mainContract.getAccountTokenBorrowable(smplToken.address, alice.address);
                        // (1000 * 25 * 0.25 - 50 * 10) / 25 = 210
                        expect(amount).to.be.equal(ethers.utils.parseUnits('230', 18));
                    });
                    
                    it('Should return limited token available to borrow by account', async() => {
                        const amount2 = await mainContract.getAccountTokenBorrowable(smplToken2.address, alice.address);
                        // (1000 * 25 * 0.25 - 50 * 10) / 10 = 525
                        // 525 > 350 (total available)
                        expect(amount2).to.be.equal(ethers.utils.parseUnits('350', 12));
                    });
                    
                    it('Should increase withdrawable amount', async() => {
                        const amount = await mainContract.getAccountTokenWithdrawable(smplToken.address, alice.address);
                        // (1000 * 25 * 0.25 - 100 * 10) / 0.25 / 25
                        expect(amount).to.be.equal(ethers.utils.parseUnits('920', 18));
                    });
                    
                    
                    // with borrowable fraction configured
                    // with liquidity provided by Bob and Carol
                    // with liquidity provided by Alice
                    // with Alice borrowed funds
                    // partially repaid
                    describe('fully repaying', () => {
                        it('Should emit events', async() => {
                            const [ tx, result ] = await txExec(
                                repay(
                                    alice,
                                    smplToken2,
                                    ethers.utils.parseUnits('51', 12)
                                )
                            );
                            
                            await assertEvent<LoanPartiallyRepaidEvent>(result, 'LoanPartiallyRepaid', {
                                who: alice.address,
                                token: smplToken2.address,
                                amount: ethers.utils.parseUnits('50', 12),
                            });
                            
                            await assertEvent<LoanFullyRepaidEvent>(result, 'LoanFullyRepaid', {
                                who: alice.address,
                                token: smplToken2.address,
                            });
                        });
                        
                        it('Should transfer funds', async() => {
                            const txCallback = () => repay(
                                alice,
                                smplToken2,
                                ethers.utils.parseUnits('51', 12)
                            );
                            
                            await expect(txCallback).to.changeTokenBalances(
                                smplToken2,
                                [ alice, mainContract ],
                                [ ethers.utils.parseUnits('-50', 12), ethers.utils.parseUnits('50', 12) ]
                            );
                        });
                        
                        
                        describe('successfully', () => {
                            beforeEach(async() => {
                                await txExec(
                                    repay(
                                        alice,
                                        smplToken2,
                                        ethers.utils.parseUnits('51', 12)
                                    )
                                );
                            });
                            
                            it('Should increase account liqudity', async() => {
                                expect(
                                    await mainContract.getAccountCollateralization(alice.address)
                                ).to.be.equal(ethers.utils.parseUnits('6250', 8));
                            });
                            
                            it('Should return proper borrowed amount', async() => {
                                expect(
                                    await mainContract.getTotalTokenDebit(smplToken2.address)
                                ).to.be.equal(0);
                            });
                            
                            it('Should return proper token debit', async() => {
                                expect(
                                    await mainContract.getAccountTokenDebit(smplToken2.address, alice.address)
                                ).to.be.equal(0);
                            });
                            
                            it('Should return proper debit value', async() => {
                                expect(
                                    await mainContract.getAccountDebitValue(alice.address)
                                ).to.be.equal(0);
                            });
                            
                            it('Should return proper token available to borrow by account', async() => {
                                const amount = await mainContract.getAccountTokenBorrowable(smplToken.address, alice.address);
                                // (1000 * 25 * 0.25) / 25 = 250
                                expect(amount).to.be.equal(ethers.utils.parseUnits('250', 18));
                            });
                            
                            it('Should return limited token available to borrow by account', async() => {
                                const amount2 = await mainContract.getAccountTokenBorrowable(smplToken2.address, alice.address);
                                // (1000 * 25 * 0.25) / 10 = 525
                                // 625 > 400 (total available)
                                expect(amount2).to.be.equal(ethers.utils.parseUnits('400', 12));
                            });
                            
                            it('Should increase withdrawable amount', async() => {
                                const amount = await mainContract.getAccountTokenWithdrawable(smplToken.address, alice.address);
                                // (1000 * 25 * 0.25) / 0.25 / 25
                                expect(amount).to.be.equal(ethers.utils.parseUnits('1000', 18));
                            });
                        });
                    });
                });
                
                
            
            
                // with borrowable fraction configured
                // with liquidity provided by Bob and Carol
                // with liquidity provided by Alice
                // with Alice borrowed funds
                describe('borrowing once again', () => {
                    beforeEach(async() => {
                        await txExec(
                            mainContract
                                .connect(alice)
                                .borrow(
                                    smplToken2.address,
                                    ethers.utils.parseUnits('50', 12)
                                )
                        );
                    });
                    
                    it('Should reduce account liqudity', async() => {
                        expect(
                            await mainContract.getAccountCollateralization(alice.address)
                        ).to.be.equal(ethers.utils.parseUnits('4750', 8));
                    });
                    
                    it('Should return proper borrowed amount', async() => {
                        expect(
                            await mainContract.getTotalTokenDebit(smplToken2.address)
                        ).to.be.equal(ethers.utils.parseUnits('150', 12));
                    });
                    
                    it('Should return proper token debit', async() => {
                        expect(
                            await mainContract.getAccountTokenDebit(smplToken2.address, alice.address)
                        ).to.be.equal(ethers.utils.parseUnits('150', 12));
                    });
                    
                    it('Should return proper debit value', async() => {
                        expect(
                            await mainContract.getAccountDebitValue(alice.address)
                        ).to.be.equal(ethers.utils.parseUnits('1500', 8));
                    });
                    
                    it('Should return proper token available to borrow by account', async() => {
                        const amount = await mainContract.getAccountTokenBorrowable(smplToken.address, alice.address);
                        // (1000 * 25 * 0.25 - 150 * 10) / 25 = 190
                        expect(amount).to.be.equal(ethers.utils.parseUnits('190', 18));
                    });
                    
                    it('Should return limited token available to borrow by account', async() => {
                        const amount2 = await mainContract.getAccountTokenBorrowable(smplToken2.address, alice.address);
                        // (1000 * 25 * 0.25 - 150 * 10) / 10 = 475
                        // 475 > 250 (total available)
                        expect(amount2).to.be.equal(ethers.utils.parseUnits('250', 12));
                    });
                    
                    it('Should reduce withdrawable amount', async() => {
                        const amount = await mainContract.getAccountTokenWithdrawable(smplToken.address, alice.address);
                        // (1000 * 25 * 0.25 - 150 * 10) / 0.25 / 25
                        expect(amount).to.be.equal(ethers.utils.parseUnits('760', 18));
                    });
                });
                
            });
        });
    });
});
