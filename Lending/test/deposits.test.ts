import {
    AssetDepositedEvent,
    AssetWithdrawnEvent,
    CollateralFactorChangedEvent,
    LendingProtocol
} from '@/LendingProtocol';
import { PriceFeedMock } from '@/PriceFeedMock';
import { TokenMock } from '@/TokenMock';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import { assertEvent, assertIsAvailableOnlyForOwner, createTokenMock, deployContract, txExec } from './helpers/utils';

const SMPL_PRICEFEED_ADDRESS = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419';

const WBTC_ADDRESS = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599';
const WBTC_PRICEFEED_ADDRESS = '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c';


xdescribe('Deposits component', () => {
    let owner : SignerWithAddress;
    let alice : SignerWithAddress;
    let bob : SignerWithAddress;
    
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
        [ owner, alice, bob ] = await ethers.getSigners();
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
    });
    
    
    describe('Initial state', () => {
        it('Should return zero deposit', async() => {
            expect(
                await mainContract.getAccountTokenDeposit(smplToken.address, alice.address)
            ).to.be.equal(0);
        });
        
        it('Should return zero deposits', async() => {
            expect(
                await mainContract.getTotalTokenDeposit(smplToken.address)
            ).to.be.equal(0);
        });
        
        it('Should return zero deposits value', async() => {
            expect(
                await mainContract.getAccountDepositValue(alice.address)
            ).to.be.equal(0);
        });
        
        it('Should return zero liquidity', async() => {
            expect(
                await mainContract.getAccountCollateralization(alice.address)
            ).to.be.equal(0);
        });
        
        it('Should not be able to withdraw anything', async() => {
            const tx = mainContract
                .connect(alice)
                .withdraw(
                    smplToken.address,
                    ethers.utils.parseUnits('1', 18)
                );
            await expect(tx).to.be.revertedWith('AmountExceedWithdrawableLimit()');
        });
    });
    
    
    describe('For non supported token', () => {
        it('getAccountTokenDeposit() should revert', async() => {
            expect(
                mainContract.getAccountTokenDeposit(WBTC_ADDRESS, alice.address)
            ).to.be.revertedWith('TokenIsNotSupported()');
        });
        
        it('getTotalTokenDeposit() should revert', async() => {
            expect(
                mainContract.getTotalTokenDeposit(WBTC_ADDRESS)
            ).to.be.revertedWith('TokenIsNotSupported()');
        });
        
        it('getTokenCollateralFactor() should revert', async() => {
            expect(
                mainContract.getTokenCollateralFactor(WBTC_ADDRESS)
            ).to.be.revertedWith('TokenIsNotSupported()');
        });
        
        it('getAccountTokenWithdrawable() should revert', async() => {
            expect(
                mainContract
                    .connect(alice)
                    .getAccountTokenWithdrawable(
                        WBTC_ADDRESS,
                        alice.address
                    )
            ).to.be.revertedWith('TokenIsNotSupported()');
        });
        
        it('setTokenCollateralFactor() should revert', async() => {
            expect(
                mainContract
                    .connect(owner)
                    .setTokenCollateralFactor(
                        WBTC_ADDRESS,
                        5e7
                    )
            ).to.be.revertedWith('TokenIsNotSupported()');
        });
        
        it('deposit() should revert', async() => {
            const tx = mainContract
                .connect(alice)
                .deposit(
                    WBTC_ADDRESS,
                    ethers.utils.parseUnits('1', 18)
                );
            await expect(tx).to.be.revertedWith('TokenIsNotSupported()');
        });
    });
    
    
    describe('Changing collateral factor', () => {
        it('Should allow to execute only by owner', async() => {
            await assertIsAvailableOnlyForOwner(async(account) => {
                return mainContract
                    .connect(account)
                    .setTokenCollateralFactor(
                        smplToken.address,
                        1e7
                    );
            });
        });
        
        it('Should emit event', async() => {
            const [ tx, result ] = await txExec(
                mainContract
                    .connect(owner)
                    .setTokenCollateralFactor(
                        smplToken.address,
                        1e7
                    )
            );
            
            await assertEvent<CollateralFactorChangedEvent>(result, 'CollateralFactorChanged', {
                token: smplToken.address,
                factor: BigNumber.from(1e7),
            });
        });
        
        describe('successfully', () => {
            beforeEach(async() => {
                await txExec(
                    mainContract
                        .connect(owner)
                        .setTokenCollateralFactor(
                            smplToken.address,
                            1e7
                        )
                );
            });
            
            it('Should update state', async() => {
                expect(
                    await mainContract.getTokenCollateralFactor(smplToken.address)
                ).to.be.equal(1e7);
            });
        });
    });
    
    
    describe('with collateral factor configured', () => {
        beforeEach(async() => {
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
        
        
        describe('Depositing', () => {
            it('Should revert without sufficient allowance', async() => {
                const tx = mainContract
                    .connect(alice)
                    .deposit(
                        smplToken.address,
                        ethers.utils.parseUnits('1', 18)
                    );
                await expect(tx).to.be.revertedWith('InsufficientAllowance()');
            });
            
            it('Should revert without sufficient token deposit', async() => {
                expect(
                    deposit(
                        alice,
                        smplToken,
                        ethers.utils.parseUnits(10e12.toString(), 18)
                    )
                ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
            });
            
            it('Should revert when transfer fails', async() => {
                await txExec(
                    smplToken.setReturnValueOnTransfer(false)
                );
                
                const tx = deposit(
                    alice,
                    smplToken,
                    ethers.utils.parseUnits('1', 18)
                );
                await expect(tx).to.be.revertedWith('CouldNotTransferFunds()');
            });
            
            it('Should emit AssetDeposited event', async() => {
                const [ tx, result ] = await txExec(
                    deposit(
                        alice,
                        smplToken,
                        ethers.utils.parseUnits('1', 18)
                    )
                );
                
                await assertEvent<AssetDepositedEvent>(result, 'AssetDeposited', {
                    who: alice.address,
                    token: smplToken.address,
                    amount: ethers.utils.parseUnits('1', 18),
                });
            });
            
            it('Should transfer tokens', async() => {
                const txCallback = () => deposit(
                    alice,
                    smplToken,
                    ethers.utils.parseUnits('1', 18)
                );
                
                await expect(txCallback).to.changeTokenBalances(
                    smplToken,
                    [ alice, mainContract ],
                    [ ethers.utils.parseUnits('-1', 18), ethers.utils.parseUnits('1', 18) ]
                );
            });
        });
        
        
        // with collateral factor configured
        describe('with deposit', () => {
            beforeEach(async() => {
                await txExec(
                    deposit(
                        alice,
                        smplToken,
                        ethers.utils.parseUnits('100', 18)
                    )
                );
            });
            
            it('Should return proper deposit', async() => {
                expect(
                    await mainContract.getAccountTokenDeposit(smplToken.address, alice.address)
                ).to.be.equal(ethers.utils.parseUnits('100', 18));
            });
            
            it('Should return proper total token deposits', async() => {
                expect(
                    await mainContract.getTotalTokenDeposit(smplToken.address)
                ).to.be.equal(ethers.utils.parseUnits('100', 18));
            });
            
            it('Should return proper withdrawable amount', async() => {
                expect(
                    await mainContract.getAccountTokenWithdrawable(smplToken.address, alice.address)
                ).to.be.equal(ethers.utils.parseUnits('100', 18));
            });
            
            it('Should return proper deposit value', async() => {
                expect(
                    await mainContract.getAccountDepositValue(alice.address)
                ).to.be.equal(ethers.utils.parseUnits('2500', 8));
            });
            
            it('Should return proper liquidity', async() => {
                expect(
                    await mainContract.getAccountCollateralization(alice.address)
                ).to.be.equal(ethers.utils.parseUnits('625', 8));
            });
            
            
            // with collateral factor configured
            // with deposit
            describe('with oracle price change', () => {
                beforeEach(async() => {
                    await txExec(
                        priceFeedContract.setDecimals(6)
                    );
                    await txExec(
                        pushNewPriceIntoFeed(priceFeedContract, ethers.utils.parseUnits('100', 6))
                    );
                });
                
                
                it('Should return proper deposit value', async() => {
                    expect(
                        await mainContract.getAccountDepositValue(alice.address)
                    ).to.be.equal(ethers.utils.parseUnits('10000', 8));
                });
                
                it('Should return proper liquidity', async() => {
                    expect(
                        await mainContract.getAccountCollateralization(alice.address)
                    ).to.be.equal(ethers.utils.parseUnits('2500', 8));
                });
            });
            
            
            // with collateral factor configured
            // with deposit
            describe('with collateral factor change', () => {
                beforeEach(async() => {
                    await txExec(
                        mainContract
                            .connect(owner)
                            .setTokenCollateralFactor(
                                smplToken.address,
                                1e7
                            )
                    );
                });
                
                it('Should return proper liquidity', async() => {
                    expect(
                        await mainContract.getAccountCollateralization(alice.address)
                    ).to.be.equal(ethers.utils.parseUnits('250', 8));
                });
            });
            
            
            describe('withdrawing', () => {
                it('Should not be able to withdraw more than have deposited', async() => {
                    const tx = mainContract
                        .connect(alice)
                        .withdraw(
                            smplToken.address,
                            ethers.utils.parseUnits('101', 18)
                        );
                    await expect(tx).to.be.revertedWith('AmountExceedWithdrawableLimit()');
                });
                
                it('Should revert when transfer fails', async() => {
                    await txExec(
                        smplToken.setReturnValueOnTransfer(false)
                    );
                    
                    const tx = mainContract
                        .connect(alice)
                        .withdraw(
                            smplToken.address,
                            ethers.utils.parseUnits('10', 18)
                        );
                    await expect(tx).to.be.revertedWith('CouldNotTransferFunds()');
                });
                
                it('Should emits AssetWithdrawn event', async() => {
                    const [ tx, result ] = await txExec(
                        mainContract
                            .connect(alice)
                            .withdraw(
                                smplToken.address,
                                ethers.utils.parseUnits('50', 18)
                            )
                    );
                    
                    await assertEvent<AssetWithdrawnEvent>(result, 'AssetWithdrawn', {
                        who: alice.address,
                        token: smplToken.address,
                        amount: ethers.utils.parseUnits('50', 18),
                    });
                });
                
                it('Should transfer tokens', async() => {
                    const txCallback = () => mainContract
                        .connect(alice)
                        .withdraw(
                            smplToken.address,
                            ethers.utils.parseUnits('50', 18)
                        );
                    
                    await expect(txCallback).to.changeTokenBalances(
                        smplToken,
                        [ alice, mainContract ],
                        [ ethers.utils.parseUnits('50', 18), ethers.utils.parseUnits('-50', 18) ]
                    );
                });
                
                
                describe('with limited liquidity', () => {
                    beforeEach(async() => {
                        await txExec(
                            mainContract.__test__burnBalance(smplToken.address, ethers.utils.parseUnits('50', 18))
                        );
                    });
                    
                    it('Should not be able to withdraw more than liquid amount', async() => {
                        const tx = mainContract
                            .connect(alice)
                            .withdraw(
                                smplToken.address,
                                ethers.utils.parseUnits('51', 18)
                            );
                        await expect(tx).to.be.revertedWith('AmountExceedLiquidDeposit()');
                    });
                    
                    it('Should be able to withdraw less than liquid amount limit', async() => {
                        await txExec(
                            mainContract
                                .connect(alice)
                                .withdraw(
                                    smplToken.address,
                                    ethers.utils.parseUnits('50', 18)
                                )
                        );
                    });
                    
                });
                
                
                describe('successfully', () => {
                    beforeEach(async() => {
                        await txExec(
                            mainContract
                                .connect(alice)
                                .withdraw(
                                    smplToken.address,
                                    ethers.utils.parseUnits('50', 18)
                                )
                        );
                    });
                    
                    it('Should return proper token deposit', async() => {
                        expect(
                            await mainContract.getAccountTokenDeposit(smplToken.address, alice.address)
                        ).to.be.equal(ethers.utils.parseUnits('50', 18));
                    });
                    
                    it('Should return proper total token deposit', async() => {
                        expect(
                            await mainContract.getTotalTokenDeposit(smplToken.address)
                        ).to.be.equal(ethers.utils.parseUnits('50', 18));
                    });
                    
                    it('Should return proper withdrawable amount', async() => {
                        expect(
                            await mainContract.getAccountTokenWithdrawable(smplToken.address, alice.address)
                        ).to.be.equal(ethers.utils.parseUnits('50', 18));
                    });
                    
                    it('Should return proper deposit value', async() => {
                        expect(
                            await mainContract.getAccountDepositValue(alice.address)
                        ).to.be.equal(ethers.utils.parseUnits('1250', 8));
                    });
                    
                    it('Should return proper liquidity', async() => {
                        expect(
                            await mainContract.getAccountCollateralization(alice.address)
                        ).to.be.equal(ethers.utils.parseUnits('312.5', 8));
                    });
                });
            });
            
            
            // with collateral factor configured
            // with deposit
            describe('with second same asset deposit by Alice', () => {
                beforeEach(async() => {
                    await txExec(
                        deposit(
                            alice,
                            smplToken,
                            ethers.utils.parseUnits('50', 18)
                        )
                    );
                });
                
                it('Should return proper total token deposits', async() => {
                    expect(
                        await mainContract.getTotalTokenDeposit(smplToken.address)
                    ).to.be.equal(ethers.utils.parseUnits('150', 18));
                });
                
                
                it('Should return proper deposit', async() => {
                    expect(
                        await mainContract.getAccountTokenDeposit(smplToken.address, alice.address)
                    ).to.be.equal(ethers.utils.parseUnits('150', 18));
                });
                
                it('Should return proper withdrawable amount', async() => {
                    expect(
                        await mainContract.getAccountTokenWithdrawable(smplToken.address, alice.address)
                    ).to.be.equal(ethers.utils.parseUnits('150', 18));
                });
                
                it('Should return proper deposit value', async() => {
                    expect(
                        await mainContract.getAccountDepositValue(alice.address)
                    ).to.be.equal(ethers.utils.parseUnits('3750', 8));
                });
                
                it('Should return proper liquidity', async() => {
                    expect(
                        await mainContract.getAccountCollateralization(alice.address)
                    ).to.be.equal(ethers.utils.parseUnits('937.5', 8));
                });
            });
            
            
            // with collateral factor configured
            // with deposit
            describe('with second same asset deposit by Bob', () => {
                beforeEach(async() => {
                    await txExec(
                        deposit(
                            bob,
                            smplToken,
                            ethers.utils.parseUnits('50', 18)
                        )
                    );
                });
                
                it('Should return proper total token deposits', async() => {
                    expect(
                        await mainContract.getTotalTokenDeposit(smplToken.address)
                    ).to.be.equal(ethers.utils.parseUnits('150', 18));
                });
                
                
                it('Should return proper Alice deposit', async() => {
                    expect(
                        await mainContract.getAccountTokenDeposit(smplToken.address, alice.address)
                    ).to.be.equal(ethers.utils.parseUnits('100', 18));
                });
                
                it('Should return proper Alice withdrawable amount', async() => {
                    expect(
                        await mainContract.getAccountTokenWithdrawable(smplToken.address, alice.address)
                    ).to.be.equal(ethers.utils.parseUnits('100', 18));
                });
                
                it('Should return proper Alice deposit value', async() => {
                    expect(
                        await mainContract.getAccountDepositValue(alice.address)
                    ).to.be.equal(ethers.utils.parseUnits('2500', 8));
                });
                
                it('Should return proper Alice liquidity', async() => {
                    expect(
                        await mainContract.getAccountCollateralization(alice.address)
                    ).to.be.equal(ethers.utils.parseUnits('625', 8));
                });
                
                
                it('Should return proper Bob token deposit', async() => {
                    expect(
                        await mainContract.getAccountTokenDeposit(smplToken.address, bob.address)
                    ).to.be.equal(ethers.utils.parseUnits('50', 18));
                });
                
                it('Should return proper Bob withdrawable amount', async() => {
                    expect(
                        await mainContract.getAccountTokenWithdrawable(smplToken.address, bob.address)
                    ).to.be.equal(ethers.utils.parseUnits('50', 18));
                });
                
                it('Should return proper Bob deposit value', async() => {
                    expect(
                        await mainContract.getAccountDepositValue(bob.address)
                    ).to.be.equal(ethers.utils.parseUnits('1250', 8));
                });
                
                it('Should return proper Bob liquidity', async() => {
                    expect(
                        await mainContract.getAccountCollateralization(bob.address)
                    ).to.be.equal(ethers.utils.parseUnits('312.5', 8));
                });
            });
            
            
            // with collateral factor configured
            // with deposit
            describe('with second (different decimals precission) asset deposit by Alice', () => {
                beforeEach(async() => {
                    await txExec(
                        deposit(
                            alice,
                            smplToken2,
                            ethers.utils.parseUnits('10', 12)
                        )
                    );
                });
                
                it('Should return proper token deposit', async() => {
                    expect(
                        await mainContract.getAccountTokenDeposit(smplToken2.address, alice.address)
                    ).to.be.equal(ethers.utils.parseUnits('10', 12));
                });
                
                it('Should return proper withdrawable amount', async() => {
                    expect(
                        await mainContract.getAccountTokenWithdrawable(smplToken2.address, alice.address)
                    ).to.be.equal(ethers.utils.parseUnits('10', 12));
                });
                
                it('Should return proper deposit value', async() => {
                    expect(
                        await mainContract.getAccountDepositValue(alice.address)
                    ).to.be.equal(ethers.utils.parseUnits('2600', 8));
                });
                
                it('Should return proper liquidity', async() => {
                    expect(
                        await mainContract.getAccountCollateralization(alice.address)
                    ).to.be.equal(ethers.utils.parseUnits('675', 8));
                });
            });
            
            
            // with collateral factor configured
            // with deposit
            describe('with second (different decimals precission) asset deposit by Bob', () => {
                beforeEach(async() => {
                    await txExec(
                        deposit(
                            bob,
                            smplToken2,
                            ethers.utils.parseUnits('10', 12)
                        )
                    );
                });
                
                it('Should return proper token deposit', async() => {
                    expect(
                        await mainContract.getAccountTokenDeposit(smplToken2.address, bob.address)
                    ).to.be.equal(ethers.utils.parseUnits('10', 12));
                });
                
                it('Should return proper withdrawable amount', async() => {
                    expect(
                        await mainContract.getAccountTokenWithdrawable(smplToken2.address, bob.address)
                    ).to.be.equal(ethers.utils.parseUnits('10', 12));
                });
                
                it('Should return proper deposit value', async() => {
                    expect(
                        await mainContract.getAccountDepositValue(bob.address)
                    ).to.be.equal(ethers.utils.parseUnits('100', 8));
                });
                
                it('Should return proper liquidity', async() => {
                    expect(
                        await mainContract.getAccountCollateralization(bob.address)
                    ).to.be.equal(ethers.utils.parseUnits('50', 8));
                });
            });
        });
        
    });
});
