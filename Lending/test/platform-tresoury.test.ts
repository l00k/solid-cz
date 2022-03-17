import {
    LendingProtocol,
    PlatformCommissionChangedEvent,
    TransferToTresouryEvent,
    WithdrawnFromTresouryEvent
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


xdescribe('Platform tresoury component', () => {
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
        
        // deposits
        await txExec(
            deposit(
                alice,
                smplToken,
                ethers.utils.parseUnits('100', 18)
            )
        );
        
        await txExec(
            deposit(
                alice,
                smplToken2,
                ethers.utils.parseUnits('100', 12)
            )
        );
    });
    
    
    describe('Initial state', () => {
        it('Should return zero platform commission', async() => {
            const deposit = await mainContract.getTokenPlatformCommission(smplToken.address);
            expect(deposit).to.be.equal(0);
        });
    });
    
    
    describe('For non supported token', () => {
        it('getTokenPlatformCommission() should revert', async() => {
            const query = mainContract.getTokenPlatformCommission(WBTC_ADDRESS);
            await expect(query).to.be.revertedWith('TokenIsNotSupported()');
        });
        
        it('setTokenPlatformCommission() should revert', async() => {
            const tx = mainContract
                .connect(owner)
                .setTokenPlatformCommission(WBTC_ADDRESS, 1e5);
            await expect(tx).to.be.revertedWith('TokenIsNotSupported()');
        });
        
        it('withdrawFromPlatformTresoury() should revert', async() => {
            const tx = mainContract
                .connect(owner)
                .withdrawFromPlatformTresoury(
                    WBTC_ADDRESS,
                    owner.address,
                    ethers.utils.parseUnits('1', 18)
                );
            await expect(tx).to.be.revertedWith('TokenIsNotSupported()');
        });
    });
    
    
    describe('Changing platform commission', () => {
        it('Should allow to execute only by owner', async() => {
            await assertIsAvailableOnlyForOwner(async(account) => {
                return mainContract
                    .connect(account)
                    .setTokenPlatformCommission(
                        smplToken.address,
                        1e5
                    );
            });
        });
        
        it('Should emit event', async() => {
            const [ tx, result ] = await txExec(
                mainContract
                    .connect(owner)
                    .setTokenPlatformCommission(
                        smplToken.address,
                        1e5
                    )
            );
            
            await assertEvent<PlatformCommissionChangedEvent>(result, 'PlatformCommissionChanged', {
                token: smplToken.address,
                fraction: 1e5,
            });
        });
        
        describe('successfully', () => {
            beforeEach(async() => {
                await txExec(
                    mainContract
                        .connect(owner)
                        .setTokenPlatformCommission(
                            smplToken.address,
                            1e5
                        )
                );
            });
            
            it('Should update state', async() => {
                const fraction = await mainContract.getTokenPlatformCommission(smplToken.address);
                expect(fraction).to.be.equal(1e5);
            });
        });
    });
    
    
    describe('with platform commission configured', () => {
        beforeEach(async() => {
            await txExec(
                mainContract
                    .connect(owner)
                    .setTokenPlatformCommission(
                        smplToken.address,
                        1e5
                    )
            );
            
            await txExec(
                mainContract
                    .connect(owner)
                    .setTokenPlatformCommission(
                        smplToken2.address,
                        2e5
                    )
            );
        });
        
        
        describe('applying platform commission', () => {
            it('Should increase accounts deposit with partial amount', async() => {
                const [ tx, result ] = await txExec(
                    mainContract
                        .__test__distributeFunds(
                            smplToken.address,
                            ethers.utils.parseUnits('100', 18)
                        )
                );
                
                const deposit = await mainContract.getAccountTokenDeposit(smplToken.address, alice.address);
                expect(deposit).to.be.equal(ethers.utils.parseUnits('190', 18));
            });
            
            it('Should increase tresoury deposit', async() => {
                const [ tx, result ] = await txExec(
                    mainContract
                        .__test__distributeFunds(
                            smplToken.address,
                            ethers.utils.parseUnits('100', 18)
                        )
                );
                
                const deposit = await mainContract.getAccountTokenDeposit(smplToken.address, mainContract.address);
                expect(deposit).to.be.equal(ethers.utils.parseUnits('10', 18).sub(1));
            });
            
            it('Should emit event', async() => {
                const [ tx, result ] = await txExec(
                    mainContract
                        .__test__distributeFunds(
                            smplToken.address,
                            ethers.utils.parseUnits('100', 18)
                        )
                );
                
                assertEvent<TransferToTresouryEvent>(result, 'TransferToTresoury', {
                    token: smplToken.address,
                    amount: ethers.utils.parseUnits('10', 18)
                });
            });
        });
        
        
        describe('with platform commission applied', () => {
            beforeEach(async() => {
                await txExec(
                    mainContract
                        .__test__distributeFunds(
                            smplToken.address,
                            ethers.utils.parseUnits('100', 18)
                        )
                );
            });
            
            
            it('Should return proper deposit', async() => {
                const deposit = await mainContract.getAccountTokenDeposit(smplToken.address, mainContract.address);
                expect(deposit).to.be.equal(ethers.utils.parseUnits('10', 18).sub(1));
            });
            
            it('Should return proper withdrawable amount', async() => {
                const value = await mainContract.getAccountTokenWithdrawable(smplToken.address, mainContract.address);
                expect(value).to.be.equal(ethers.utils.parseUnits('10', 18).sub(1));
            });
            
            
            describe('Withdrawing from tresoury', () => {
                it('Should allow to execute only by owner', async() => {
                    await assertIsAvailableOnlyForOwner(async(account) => {
                        return mainContract
                            .connect(account)
                            .withdrawFromPlatformTresoury(
                                smplToken.address,
                                owner.address,
                                ethers.utils.parseUnits('10', 18).sub(1)
                            );
                    });
                });
                
                it('Should not be able to withdraw more than have deposited', async() => {
                    const tx = mainContract
                        .connect(owner)
                        .withdrawFromPlatformTresoury(
                            smplToken.address,
                            owner.address,
                            ethers.utils.parseUnits('11', 18)
                        );
                    await expect(tx).to.be.revertedWith('AmountExceedWithdrawableLimit()');
                });
                
                it('Should emit event', async() => {
                    const [ tx, result ] = await txExec(
                        mainContract
                            .connect(owner)
                            .withdrawFromPlatformTresoury(
                                smplToken.address,
                                owner.address,
                                ethers.utils.parseUnits('10', 18).sub(1)
                            )
                    );
                    
                    assertEvent<WithdrawnFromTresouryEvent>(result, 'WithdrawnFromTresoury', {
                        token: smplToken.address,
                        to: owner.address,
                        amount: ethers.utils.parseUnits('10', 18).sub(1)
                    });
                });
                
                it('Should transfer tokens', async() => {
                    const txCallback = () => mainContract
                        .connect(owner)
                        .withdrawFromPlatformTresoury(
                            smplToken.address,
                            owner.address,
                            ethers.utils.parseUnits('10', 18).sub(1)
                        );
                    
                    await expect(txCallback).to.changeTokenBalances(
                        smplToken,
                        [ mainContract, owner ],
                        [ ethers.utils.parseUnits('-10', 18).add(1), ethers.utils.parseUnits('10', 18).sub(1) ]
                    );
                });
                
            });
        });
        
    });
});
