import { Contract } from '@ethersproject/contracts/src.ts/index';
import { ethers } from 'hardhat';


export const coinName : string = 'SampleCoin';
export const coinSymbol : string = '$';
export const initialSupply : number = 1000000;


export const Factory : { [contractName : string]: () => Promise<Contract> } = {
    CoinBase: async() => {
        const [ owner ] = await ethers.getSigners();
        
        const contractFactory = await ethers.getContractFactory('CoinBase', owner);
        const contract : Contract = <any> await contractFactory.deploy(coinName, coinSymbol, initialSupply);
        await contract.deployed();
        
        return contract;
    },
    Ownable: async() => {
        const [ owner ] = await ethers.getSigners();
        
        const contractFactory = await ethers.getContractFactory('Ownable', owner);
        const contract : Contract = <any> await contractFactory.deploy();
        await contract.deployed();
        
        return contract;
    },
    Market: async() => {
        const [ owner ] = await ethers.getSigners();

        const contractFactory = await ethers.getContractFactory('Market', owner);
        const contract : Contract = <any> await contractFactory.deploy();
        await contract.deployed();

        return contract;
    },
    SampleCoin: async() => {
        const [ owner ] = await ethers.getSigners();

        const contractFactory = await ethers.getContractFactory('SampleCoin', owner);
        const contract : Contract = <any> await contractFactory.deploy();
        await contract.deployed();

        return contract;
    },
};
